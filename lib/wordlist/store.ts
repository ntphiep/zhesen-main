import type { SupabaseClient } from '@supabase/supabase-js'
import type { DictEntryDetail, DictEntryPreview, DictExample } from '@/lib/dictionary/types'
import { isCleanExample, stripPhraseStop } from '@/lib/dictionary/textQuality'
import type { LangCode } from '@/lib/languages'
import { userWordRow, type UserWord, type WordDraft, type WordStatus } from './types'
import { z } from '@/lib/zod'
import { fetchAllRows } from '@/lib/supabase/paginate'
import { ensureSession } from '@/lib/supabase/session'

export * from './types'

export function parseUserWordRow(r: unknown): UserWord {
  const x = userWordRow.parse(r)
  return {
    id: x.id, lang: x.lang, entryId: x.entry_id, headword: x.headword, reading: x.reading,
    ipa: x.ipa, pos: x.pos, meaningVi: x.meaning_vi && stripPhraseStop(x.meaning_vi), meaningEn: x.meaning_en, level: x.level,
    example: x.example, exampleTranslation: x.example_translation, audioUrl: x.audio_url,
    notes: x.notes, status: x.status, tags: x.tags, createdAt: x.created_at, updatedAt: x.updated_at,
    fsrsDueAt: x.fsrs_due_at, fsrsLapses: x.fsrs_lapses,
  }
}

/** Pick an example for a flashcard: clean text, a Vietnamese translation present,
 *  shortest first because a card has room for one line. */
function pickExample(examples: DictExample[]): DictExample | null {
  const usable = examples.filter((x) => isCleanExample(x.text) && x.translationVi?.trim())
  if (usable.length === 0) return null
  return usable.reduce((best, x) => (x.text.length < best.text.length ? x : best))
}

/** Whole-word pinyin from `lex.entries.attributes`. Null when it equals the IPA field:
 *  the pipeline puts pinyin there for Chinese, so both would print "xué xí" twice. */
function readingFrom(attributes: Record<string, unknown> | undefined, ipa: string | null): string | null {
  const pinyin = attributes?.pinyin
  if (typeof pinyin !== 'string' || !pinyin.trim()) return null
  const reading = pinyin.trim()
  return reading === ipa?.trim() ? null : reading
}

/** Build a wordlist draft from a dictionary entry. A full entry also yields an example
 *  sentence and, for Chinese, the reading; a preview carries neither. */
export function draftFromDictEntry(e: DictEntryPreview | DictEntryDetail): WordDraft {
  const detail = 'examples' in e ? e : null
  const example = detail ? pickExample(detail.examples) : null
  return {
    lang: e.lang, entryId: e.id, headword: e.headword,
    reading: detail ? readingFrom(detail.attributes, e.ipa) : null,
    ipa: e.ipa, pos: e.pos,
    meaningVi: e.glossVi, meaningEn: e.glossEn, level: e.level,
    example: example?.text ?? null,
    exampleTranslation: example?.translationVi ?? null,
    audioUrl: e.audioUrl, notes: null, status: 'new', tags: [],
  }
}

function draftToRow(d: WordDraft): Record<string, unknown> {
  return {
    lang: d.lang, entry_id: d.entryId, headword: d.headword, reading: d.reading, ipa: d.ipa, pos: d.pos,
    meaning_vi: d.meaningVi, meaning_en: d.meaningEn, level: d.level, example: d.example,
    example_translation: d.exampleTranslation, audio_url: d.audioUrl, notes: d.notes, status: d.status, tags: d.tags,
  }
}

function patchToRow(p: Partial<WordDraft>): Record<string, unknown> {
  const map = {
    lang: 'lang', entryId: 'entry_id', headword: 'headword', reading: 'reading', ipa: 'ipa', pos: 'pos',
    meaningVi: 'meaning_vi', meaningEn: 'meaning_en', level: 'level', example: 'example',
    exampleTranslation: 'example_translation', audioUrl: 'audio_url', notes: 'notes', status: 'status', tags: 'tags',
  } satisfies Record<keyof WordDraft, string>
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(p) as (keyof WordDraft)[]) out[map[k]] = p[k]
  return out
}

export async function listWords(supabase: SupabaseClient): Promise<UserWord[]> {
  const rows = await fetchAllRows((from, to) =>
    supabase.from('user_words').select('*')
      .order('created_at', { ascending: false }).order('id')
      .range(from, to))
  return rows.map(parseUserWordRow)
}

/** The newest few words, for the strip under the lookup boxes. `listWords` pages through
 *  the whole notebook, which is the wrong cost for a row of chips. */
export async function listRecentWords(supabase: SupabaseClient, limit: number): Promise<UserWord[]> {
  const { data, error } = await supabase.from('user_words').select('*')
    .order('created_at', { ascending: false }).order('id').limit(limit)
  if (error) throw error
  return (data ?? []).map(parseUserWordRow)
}

/** The words forgotten most often, at least `minLapses` times each: the wordlist's
 *  "Hay sai" filter, as a short list for the home page. */
export async function listLeeches(supabase: SupabaseClient, minLapses: number, limit: number): Promise<UserWord[]> {
  const { data, error } = await supabase.from('user_words').select('*')
    .gte('fsrs_lapses', minLapses)
    .order('fsrs_lapses', { ascending: false }).order('id').limit(limit)
  if (error) throw error
  return (data ?? []).map(parseUserWordRow)
}

/** Row count without downloading the rows. The sign-in pages need only the number: a
 *  browser that already holds words must not sign in to a different account. */
export async function countWords(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase.from('user_words').select('*', { count: 'exact', head: true })
  if (error) throw error
  return count ?? 0
}

/** The six fields every practice mode reads. Nothing else is fetched. */
export interface PracticeWord {
  id: string
  lang: LangCode
  headword: string
  ipa: string | null
  meaningVi: string | null
  audioUrl: string | null
}

const practiceWordRow = z.object({
  id: z.string(),
  lang: z.enum(['zh', 'es', 'en']),
  headword: z.string().min(1),
  ipa: z.string().nullable(),
  meaning_vi: z.string().nullable(),
  audio_url: z.string().nullable(),
})

/** Enough words to fill a round and still have wrong answers to choose from:
 *  `buildQuiz` draws its distractors from the same pool. */
export const PRACTICE_POOL = 60

export interface PracticePoolOptions {
  pool?: number
  /** The mode cannot use a word with no Vietnamese meaning. */
  needsMeaning?: boolean
  rand?: () => number
}

/** A pool of words for one practice round: six columns, server-side cap, random offset.
 *  `needsMeaning` must filter server-side too -- the window is adjacent rows by
 *  created_at, so filtering after it is taken can empty the round. */
export async function listPracticeWords(
  supabase: SupabaseClient, options: PracticePoolOptions = {},
): Promise<PracticeWord[]> {
  const { pool = PRACTICE_POOL, needsMeaning = false, rand = Math.random } = options
  // Both queries must apply the same filters: the count decides the offset the
  // window is taken from.
  const countQuery = supabase.from('user_words').select('*', { count: 'exact', head: true })
  const { count, error: countError } = await (needsMeaning
    ? countQuery.not('meaning_vi', 'is', null).neq('meaning_vi', '')
    : countQuery)
  if (countError) throw countError
  const total = count ?? 0
  if (total === 0) return []

  const offset = total > pool ? Math.floor(rand() * (total - pool + 1)) : 0
  const rowQuery = supabase.from('user_words').select('id, lang, headword, ipa, meaning_vi, audio_url')
  const { data, error } = await (needsMeaning
    ? rowQuery.not('meaning_vi', 'is', null).neq('meaning_vi', '')
    : rowQuery)
    .order('created_at', { ascending: false }).order('id')
    .range(offset, offset + pool - 1)
  if (error) throw error

  return practiceWordRow.array().parse(data ?? []).map((r) => ({
    id: r.id, lang: r.lang, headword: r.headword, ipa: r.ipa,
    meaningVi: r.meaning_vi && stripPhraseStop(r.meaning_vi), audioUrl: r.audio_url,
  }))
}

/** Entry ids already saved for a language (RLS scopes this to the current user).
 * Used to dedupe a bulk "add whole level" import against the existing wordlist. */
const savedEntryIdRow = z.object({ entry_id: z.string() })

export async function listSavedEntryIds(supabase: SupabaseClient, lang: LangCode): Promise<Set<string>> {
  const rows = await fetchAllRows((from, to) =>
    supabase.from('user_words').select('entry_id').eq('lang', lang).not('entry_id', 'is', null)
      .order('id').range(from, to))
  return new Set(savedEntryIdRow.array().parse(rows).map((r) => r.entry_id))
}

/** Whether this dictionary entry is already saved. A read, so no `ensureSession`: with no
 *  session RLS returns no rows and the answer is false. */
export async function isWordSaved(supabase: SupabaseClient, entryId: string): Promise<boolean> {
  const { data, error } = await supabase.from('user_words').select('id').eq('entry_id', entryId).limit(1)
  // The button falls back to offering the add, and the add reports the real error.
  if (error) return false
  return (data?.length ?? 0) > 0
}

/** Raised when a dictionary entry is already saved in the user's wordlist. */
export class WordAlreadyExistsError extends Error {
  constructor(public readonly entryId: string) {
    super(`Word already in wordlist: ${entryId}`)
    this.name = 'WordAlreadyExistsError'
  }
}

export async function addWord(supabase: SupabaseClient, draft: WordDraft): Promise<UserWord> {
  await ensureSession(supabase)
  // Dictionary-sourced words dedupe by entry_id, scoped to this user by RLS. Custom
  // words (entryId null) are never duplicates.
  if (draft.entryId) {
    const { data: existing, error: checkError } = await supabase
      .from('user_words').select('id').eq('entry_id', draft.entryId).limit(1)
    if (checkError) throw checkError
    if (existing && existing.length > 0) throw new WordAlreadyExistsError(draft.entryId)
  }
  const { data, error } = await supabase.from('user_words').insert(draftToRow(draft)).select().single()
  // The read above cannot see an in-flight request, so two overlapping adds both pass it.
  // `user_words_user_entry_key` (migration 0031) stops the second; 23505 is unique_violation.
  if (error?.code === '23505' && draft.entryId) throw new WordAlreadyExistsError(draft.entryId)
  if (error) throw error
  return parseUserWordRow(data)
}

export async function updateWord(supabase: SupabaseClient, id: string, patch: Partial<WordDraft>): Promise<UserWord> {
  const { data, error } = await supabase.from('user_words').update(patchToRow(patch)).eq('id', id).select().single()
  if (error) throw error
  return parseUserWordRow(data)
}

export async function deleteWord(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('user_words').delete().eq('id', id)
  if (error) throw error
}

export async function deleteWords(supabase: SupabaseClient, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from('user_words').delete().in('id', ids)
  if (error) throw error
}

/** PostgREST returns at most 1000 rows per response whatever was asked for, so a larger
 *  bulk insert reports back short. Also the unit a failed chunk is retried in. */
const INSERT_CHUNK = 500

/** Insert one draft, recovering from the two constraint failures an import can
 *  legitimately hit. Returns null for a word already in the wordlist. */
async function insertOne(supabase: SupabaseClient, draft: WordDraft): Promise<UserWord | null> {
  const { data, error } = await supabase.from('user_words').insert(draftToRow(draft)).select().single()
  if (!error) return parseUserWordRow(data)

  // 23505 unique_violation on `user_words_user_entry_key` (migration 0031): already
  // saved, which for an import is a row to skip rather than a failure.
  if (error.code === '23505') return null

  // 23503 foreign_key_violation: the imported entry_id no longer names a row in
  // lex.entries. Keep the word, drop the link.
  if (error.code === '23503' && draft.entryId !== null) {
    const retry = await supabase.from('user_words')
      .insert(draftToRow({ ...draft, entryId: null })).select().single()
    if (retry.error) throw retry.error
    return parseUserWordRow(retry.data)
  }

  throw error
}

/** Bulk-insert drafts. One request per chunk; a refused chunk is split down to single
 *  rows. Returns the rows inserted -- fewer than asked for means some were already saved. */
export async function addWords(supabase: SupabaseClient, drafts: WordDraft[]): Promise<UserWord[]> {
  if (drafts.length === 0) return []
  await ensureSession(supabase)

  const inserted: UserWord[] = []
  for (let i = 0; i < drafts.length; i += INSERT_CHUNK) {
    inserted.push(...await insertBatch(supabase, drafts.slice(i, i + INSERT_CHUNK)))
  }
  return inserted
}

/** Below this, split no further and insert one row at a time. */
const SPLIT_FLOOR = 16

/** Insert a batch, halving it when the database refuses. Halving finds one bad row in a
 *  500-row chunk in about forty requests; 500 sequential inserts cost about fifty seconds. */
async function insertBatch(supabase: SupabaseClient, batch: WordDraft[]): Promise<UserWord[]> {
  if (batch.length === 0) return []
  const { data, error } = await supabase.from('user_words').insert(batch.map(draftToRow)).select()
  if (!error) return (data ?? []).map(parseUserWordRow)
  if (error.code !== '23505' && error.code !== '23503') throw error

  if (batch.length <= SPLIT_FLOOR) {
    const kept: UserWord[] = []
    for (const draft of batch) {
      const row = await insertOne(supabase, draft)
      if (row) kept.push(row)
    }
    return kept
  }

  const mid = Math.ceil(batch.length / 2)
  const head = await insertBatch(supabase, batch.slice(0, mid))
  const tail = await insertBatch(supabase, batch.slice(mid))
  return [...head, ...tail]
}

/** Bulk status change. Same status for every id, so one query suffices; unlike tags
 *  this needs no per-row merge. */
export async function updateWordsStatus(supabase: SupabaseClient, ids: string[], status: WordStatus): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from('user_words').update({ status }).in('id', ids)
  if (error) throw error
}
