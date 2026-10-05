import 'server-only'
import { getCachedInflections, getCachedTermPreviews } from '@/lib/dictionary/cached'
import type { LangCode } from '@/lib/languages'
import { z } from '@/lib/zod'
import { createClient } from '@/lib/supabase/server'
import { coachGround, readCoach, storeCoach } from './coach'
import {
  ERASED_TASKS, checkGroundedCoach, coachInput, coachOutput, groundedCoachPrompt, suggestOutput,
  type SuggestOutput, type TaskName,
} from './tasks'

/**
 * One assistant request as the route runs it: the task's prompt and checks from
 * `./tasks`, plus what only the server can add, read from the dictionary rather than
 * taken from the browser. A task with no server step runs as `./tasks` declares it.
 */
export interface Job {
  system: string
  user: string
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
 *  stored for every learner. Without one, or when the entry cannot be read, it is coached
 *  from the headword the learner saved. */
const coach: ServerStep = async (input, job) => {
  const { entryId } = coachInput.parse(input)
  if (!entryId) return withForms('coach')(input, job)
  const supabase = await createClient()
  const cached = await readCoach(supabase, entryId)
  if (cached) return { ...job, cached }
  const ground = await coachGround(entryId).catch((e: unknown) => {
    console.error('ai coach ground failed', e instanceof Error ? e.message : String(e))
    return null
  })
  if (!ground) return withForms('coach')(input, job)
  return {
    ...job,
    user: groundedCoachPrompt(ground),
    parse: (value) => checkGroundedCoach(value, ground),
    finish: async (answer, model) => {
      const out = coachOutput.parse(answer)
      await storeCoach(supabase, entryId, model, out)
      return out
    },
  }
}

const STEPS: Partial<Record<TaskName, ServerStep>> = {
  enrich: withForms('enrich'),
  coach,
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
