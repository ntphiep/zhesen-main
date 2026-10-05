import 'server-only'
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from '@/lib/zod'
import { getCachedCharacters, getCachedEntryDetail, getCachedInflections } from '@/lib/dictionary/cached'
import { getCachedLearnerLayer } from '@/lib/dictionary/learnerCached'
import { classifyRelations } from '@/lib/dictionary/relations'
import { isSentenceTranslation } from '@/lib/dictionary/textQuality'
import { entryGlosses, mainSenses, senseSections } from '@/lib/dictionary/wordPage'
import { COACH_PROMPT_VERSION, coachOutput, type CoachGround, type CoachOutput } from './tasks'

/**
 * The word coach's ground and its shared answers. The ground is read from the dictionary's
 * caches by entry id, never taken from the browser: the reviewed learner layer when the entry
 * has one, its Wiktionary senses otherwise. Answers are kept in public.ai_coach
 * (supabase/migrations/0181_ai_coach_cache.sql) under `coachKey`, so every learner reads one and
 * a changed ground misses the cache by construction.
 */

const SENSES = 3
const CONFUSABLES = 5
const COLLOCATIONS = 8
const EXAMPLES = 5

const numbered = (prefix: string, i: number) => `${prefix}${i + 1}`

/** The entry's ground, or null when there is no such entry. */
export async function coachGround(entryId: string): Promise<CoachGround | null> {
  const detail = await getCachedEntryDetail(entryId)
  if (!detail) return null
  const [layer, forms, chars] = await Promise.all([
    getCachedLearnerLayer(entryId),
    getCachedInflections(entryId).catch(() => []),
    detail.lang === 'zh' ? getCachedCharacters(detail.headword).catch(() => []) : Promise.resolve([]),
  ])
  const base = {
    lang: detail.lang,
    headword: detail.headword,
    forms: forms.map((f) => f.formText),
    hanViet: chars.filter((c) => c.hanViet.length > 0).map((c) => ({ char: c.char, readings: c.hanViet })),
  }

  if (layer && layer.senses.length > 0) {
    return {
      ...base,
      gist: layer.gistVi,
      senses: layer.senses.slice(0, SENSES).map((s) => ({ pos: s.pos, vi: s.viTerms.join(', '), en: s.enDefinition })),
      confusables: layer.confusables.slice(0, CONFUSABLES)
        .map((l, i) => ({ id: numbered('k', i), text: l.text, note: l.noteVi })),
      collocations: layer.senses.flatMap((s) => s.collocations).slice(0, COLLOCATIONS)
        .map((l, i) => ({ id: numbered('c', i), text: l.text, vi: l.vi })),
      examples: layer.senses.flatMap((s) => s.examples).filter((x) => x.vi.trim()).slice(0, EXAMPLES)
        .map((x, i) => ({ id: numbered('e', i), text: x.text, vi: x.vi })),
    }
  }

  const senses = mainSenses(senseSections(detail.senses), SENSES).flatMap((g) => g.senses).slice(0, SENSES)
  const glosses = entryGlosses(detail)
  return {
    ...base,
    gist: senses.flatMap((s) => (s.glossVi ? [s.glossVi] : [])),
    senses: senses.map((s) => ({ pos: s.pos, vi: s.glossVi, en: s.glossEn })),
    confusables: [],
    collocations: classifyRelations(detail.relations).collocations.slice(0, COLLOCATIONS)
      .map((text, i) => ({ id: numbered('c', i), text, vi: null })),
    // Sense-linked and truly translated, as the word page filters them.
    examples: detail.examples
      .flatMap((e) => (e.senseId && e.translationVi && isSentenceTranslation(e.translationVi, glosses) ? [{ text: e.text, vi: e.translationVi }] : []))
      .slice(0, EXAMPLES)
      .map((e, i) => ({ id: numbered('e', i), ...e })),
  }
}

/** The sha256 of exactly what the prompt is built from, with the entry and prompt version. */
export function coachKey(entryId: string, ground: CoachGround): string {
  return createHash('sha256').update(JSON.stringify({ v: COACH_PROMPT_VERSION, entryId, ground })).digest('hex')
}

const storedRow = z.object({ answer: z.unknown() })

/** The stored answer for this key, or null. */
export async function readCoach(supabase: SupabaseClient, key: string): Promise<CoachOutput | null> {
  try {
    const { data, error } = await supabase.from('ai_coach').select('answer').eq('cache_key', key).maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    const parsed = coachOutput.safeParse(storedRow.parse(data).answer)
    return parsed.success ? parsed.data : null
  } catch (e) {
    console.error('ai coach read failed', e instanceof Error ? e.message : String(e))
    return null
  }
}

/** Keeps a checked answer for every learner; the secret proves the write comes from this
 *  server. A failed write costs the next learner a call. */
export async function storeCoach(
  supabase: SupabaseClient, secret: string, key: string, entryId: string, model: string, answer: CoachOutput,
): Promise<void> {
  try {
    const { error } = await supabase.rpc('ai_coach_store', {
      p_secret: secret, p_cache_key: key, p_entry_id: entryId, p_prompt_version: COACH_PROMPT_VERSION,
      p_model: model, p_answer: answer,
    })
    if (error) throw new Error(error.message)
  } catch (e) {
    console.error('ai coach write failed', e instanceof Error ? e.message : String(e))
  }
}
