import 'server-only'
import { getCachedInflections, getCachedTermPreviews } from '@/lib/dictionary/cached'
import { countDueCards } from '@/lib/wordlist/review'
import type { LangCode } from '@/lib/languages'
import { z } from '@/lib/zod'
import { createClient } from '@/lib/supabase/server'
import type { ModelTurn } from './client'
import { aiCacheSecret } from './cacheSecret'
import { coachGround, coachKey, readCoach, storeCoach } from './coach'
import {
  ERASED_TASKS, chatInput, chatSystem, chatTurns, checkGroundedCoach, coachInput, coachOutput,
  groundedCoachPrompt, suggestOutput, type ChatGround, type SuggestOutput, type TaskName,
} from './tasks'

/**
 * One assistant request as the route runs it: the task's prompt and checks from
 * `./tasks`, plus what only the server can add, read from the dictionary rather than
 * taken from the browser. A task with no server step runs as `./tasks` declares it.
 */
export interface Job {
  system: string
  user: string
  /** The conversation as turns; sent in place of `user`. */
  messages?: ModelTurn[]
  /** The model's JSON, checked; null asks the other router once, then fails. */
  parse(value: unknown): unknown | null
  /** The checked answer completed from the dictionary, which is what the browser gets. */
  finish?(answer: unknown, model: string): Promise<unknown>
  /** An answer already stored: the route returns it and asks no model. */
  cached?: unknown
}

type ServerStep = (input: unknown, job: Job) => Promise<Job>

/** The job for this input, or null when the task refuses the input. */
export async function prepareJob(task: TaskName, input: unknown): Promise<Job | null> {
  const spec = ERASED_TASKS[task]
  const user = spec.promptFor(input)
  if (user === null) return null
  const job: Job = { system: spec.system, user, parse: spec.parserFor(input) }
  const step = STEPS[task]
  return step ? step(input, job) : job
}

const wordInput = z.object({ lang: z.enum(['en', 'zh', 'es']), headword: z.string() })

/** An example has to use the word, and "took" uses take: the forms come from the entry the
 *  headword names, when the dictionary has one. */
const withForms = (task: 'enrich' | 'coach'): ServerStep => async (input, job) => {
  const { lang, headword } = wordInput.parse(input)
  return { ...job, parse: ERASED_TASKS[task].parserFor(input, await formsOf(lang, headword.trim())) }
}

/** A word with an entry is coached from the entry's own data, and its checked answer is
 *  stored for every learner when the cache secret is set. Without an entry, or when it cannot
 *  be read, it is coached from the headword the learner saved. */
const coach: ServerStep = async (input, job) => {
  const { entryId } = coachInput.parse(input)
  if (!entryId) return withForms('coach')(input, job)
  const ground = await coachGround(entryId).catch((e: unknown) => {
    console.error('ai coach ground failed', e instanceof Error ? e.message : String(e))
    return null
  })
  if (!ground) return withForms('coach')(input, job)
  const supabase = await createClient()
  const key = coachKey(entryId, ground)
  const cached = await readCoach(supabase, key)
  if (cached) return { ...job, cached }
  return {
    ...job,
    user: groundedCoachPrompt(ground),
    parse: (value) => checkGroundedCoach(value, ground),
    finish: async (answer, model) => {
      const out = coachOutput.parse(answer)
      const secret = await aiCacheSecret()
      if (secret) await storeCoach(supabase, secret, key, entryId, model, out)
      return out
    },
  }
}

/** The chat as role-tagged turns, with the entry on screen and the learner's queue read
 *  here. Either read failing leaves the tutor without it rather than failing the question. */
const chat: ServerStep = async (input, job) => {
  const { context, entryId, messages } = chatInput.parse(input)
  const [ground, study] = await Promise.all([
    entryId ? coachGround(entryId).catch(logged('ai chat entry failed', null)) : null,
    studyOf().catch(logged('ai chat study failed', null)),
  ])
  return { ...job, system: chatSystem(context, { entry: ground, study }), messages: chatTurns(messages) }
}

const logged = <T>(what: string, fallback: T) => (e: unknown): T => {
  console.error(what, e instanceof Error ? e.message : String(e))
  return fallback
}

const WEAKEST = 10
const weakRow = z.object({
  lang: z.enum(['en', 'zh', 'es']), headword: z.string(), meaning_vi: z.string().nullable(),
})

/** The due count the review button shows and the reviewed words of least stability; RLS
 *  scopes both to the signed-in learner. */
async function studyOf(): Promise<ChatGround['study']> {
  const supabase = await createClient()
  const weak = async () => {
    const { data, error } = await supabase.from('user_words').select('lang, headword, meaning_vi')
      .gt('fsrs_reps', 0).order('fsrs_stability', { ascending: true }).limit(WEAKEST)
    if (error) throw error
    return z.array(weakRow).parse(data ?? []).map((r) => ({ lang: r.lang, headword: r.headword, meaningVi: r.meaning_vi }))
  }
  const [due, weakest] = await Promise.all([countDueCards(supabase), weak()])
  return { due, weakest }
}

const STEPS: Partial<Record<TaskName, ServerStep>> = {
  enrich: withForms('enrich'),
  coach,
  chat,
  suggest: async (_input, job) => ({ ...job, finish: async (answer) => resolveSuggestions(suggestOutput.parse(answer)) }),
}

/** The inflected forms of the entry spelled `headword`; none when it has no entry or the
 *  read fails, which leaves the regular endings `mentions` allows. */
export async function formsOf(lang: LangCode, headword: string): Promise<string[]> {
  try {
    const entry = (await getCachedTermPreviews(lang, [headword]))
      .find((p) => p.headword.toLowerCase() === headword.toLowerCase())
    return entry ? (await getCachedInflections(entry.id)).map((f) => f.formText) : []
  } catch (e) {
    console.error('ai forms lookup failed', e instanceof Error ? e.message : String(e))
    return []
  }
}

/** Only candidates the dictionary has, each with the dictionary's own gloss and entry, so a
 *  suggestion never opens another empty search. A failed read keeps the candidates without
 *  an entry, which the page labels as unchecked. */
export async function resolveSuggestions(out: SuggestOutput): Promise<SuggestOutput> {
  const langs = [...new Set(out.words.map((w) => w.lang))]
  try {
    const previews = new Map((await Promise.all(langs.map(async (lang) => {
      const rows = await getCachedTermPreviews(lang, out.words.filter((w) => w.lang === lang).map((w) => w.headword))
      return rows.map((p) => [`${lang}:${p.matchText.toLowerCase()}`, p] as const)
    }))).flat())
    const seen = new Set<string>()
    return {
      words: out.words.flatMap((w) => {
        const p = previews.get(`${w.lang}:${w.headword.toLowerCase()}`)
        const gloss = p?.glossVi ?? p?.glossEn
        if (!p || !gloss || seen.has(p.id)) return []
        seen.add(p.id)
        return [{ lang: w.lang, headword: p.headword, meaningVi: gloss, entryId: p.id }]
      }),
    }
  } catch (e) {
    console.error('ai suggest lookup failed', e instanceof Error ? e.message : String(e))
    return out
  }
}
