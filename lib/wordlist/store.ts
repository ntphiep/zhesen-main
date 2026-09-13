import type { SupabaseClient } from '@supabase/supabase-js'
import type { DictEntryDetail, DictEntryPreview, DictExample } from '@/lib/dictionary/types'
import { isCleanExample } from '@/lib/dictionary/textQuality'
import type { LangCode } from '@/lib/languages'
import { userWordRow, type UserWord, type WordDraft, type WordStatus } from './types'
import { z } from 'zod'
import { fetchAllRows } from '@/lib/supabase/paginate'
import { ensureSession } from '@/lib/supabase/session'

export * from './types'

export function parseUserWordRow(r: unknown): UserWord {
  const x = userWordRow.parse(r)
  return {
    id: x.id, lang: x.lang, entryId: x.entry_id, headword: x.headword, reading: x.reading,
    ipa: x.ipa, pos: x.pos, meaningVi: x.meaning_vi, meaningEn: x.meaning_en, level: x.level,
    example: x.example, exampleTranslation: x.example_translation, audioUrl: x.audio_url,
    notes: x.notes, status: x.status, tags: x.tags, createdAt: x.created_at, updatedAt: x.updated_at,
  }
}

/**
 * Pick an example sentence worth putting on a flashcard.
 *
 * `isCleanExample` rejects the run-together strings the Wiktionary dump carries in
 * places, and a sentence with no Vietnamese translation teaches nothing to a
 * learner who cannot read it yet. Shortest first: a flashcard has room for one
 * line, and a short sentence is the one a learner can hold in their head.
 */
function pickExample(examples: DictExample[]): DictExample | null {
  const usable = examples.filter((x) => isCleanExample(x.text) && x.translationVi?.trim())
  if (usable.length === 0) return null
  return usable.reduce((best, x) => (x.text.length < best.text.length ? x : best))
}

/**
 * The whole-word pinyin `lex.entries.attributes` carries for Chinese entries.
 *
 * Skipped when the entry's IPA field already holds the same text: for Chinese the
 * pipeline puts the pinyin there, so filling both printed "xué xí" twice on the
 * review card, once as the reading and once as the pronunciation.
 */
function readingFrom(attributes: Record<string, unknown> | undefined, ipa: string | null): string | null {
  const pinyin = attributes?.pinyin
  if (typeof pinyin !== 'string' || !pinyin.trim()) return null
  const reading = pinyin.trim()
  return reading === ipa?.trim() ? null : reading
}

/**
 * Build a wordlist draft from a dictionary entry.
 *
 * Given the full entry rather than a preview, the draft also carries an example
 * sentence and, for Chinese, the reading. Those fields were hardcoded to null,
 * and `WordReviewCard` has rendered `card.example` all along -- so every card
 * added from the lookup page was a bare word with no context, on a page built to
 * show one. A preview (the reader's tap-to-lookup popover) has neither to offer
 * and still produces the draft it always did.
 */
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
    supabase.from('user_words').select('*').order('created_at', { ascending: false }).range(from, to))
  return rows.map(parseUserWordRow)
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

/**
 * A pool of words for one practice round.
 *
 * The four modes used `listWords`, which is `select('*')` over a 26-column table
 * paginated a thousand rows at a time. A 407-word account therefore pulled 407
 * full rows -- examples, notes, all ten FSRS columns -- to build a six-tile
 * matching round, and paid it again on every change of mode. Six columns and a
 * server-side cap instead.
 *
 * The window starts at a random offset so the same sixty words do not come up
 * every session; `rand` is injectable for the same reason `buildQuiz` takes one.
 */
export async function listPracticeWords(
  supabase: SupabaseClient, pool: number = PRACTICE_POOL, rand: () => number = Math.random,
): Promise<PracticeWord[]> {
  const { count, error: countError } = await supabase
    .from('user_words').select('*', { count: 'exact', head: true })
  if (countError) throw countError
  const total = count ?? 0
  if (total === 0) return []

  const offset = total > pool ? Math.floor(rand() * (total - pool + 1)) : 0
  const { data, error } = await supabase
    .from('user_words')
    .select('id, lang, headword, ipa, meaning_vi, audio_url')
    .order('created_at', { ascending: false })
    .range(offset, offset + pool - 1)
  if (error) throw error

  return practiceWordRow.array().parse(data ?? []).map((r) => ({
    id: r.id, lang: r.lang, headword: r.headword, ipa: r.ipa,
    meaningVi: r.meaning_vi, audioUrl: r.audio_url,
  }))
}

/** Entry ids already saved for a language (RLS scopes this to the current user).
 * Used to dedupe a bulk "add whole level" import against the existing wordlist. */
const savedEntryIdRow = z.object({ entry_id: z.string() })

export async function listSavedEntryIds(supabase: SupabaseClient, lang: LangCode): Promise<Set<string>> {
  const rows = await fetchAllRows((from, to) =>
    supabase.from('user_words').select('entry_id').eq('lang', lang).not('entry_id', 'is', null).range(from, to))
  return new Set(savedEntryIdRow.array().parse(rows).map((r) => r.entry_id))
}

/** Raised when a dictionary entry is already saved in the user's wordlist. */
export class WordAlreadyExistsError extends Error {
  constructor(public readonly entryId: string) {
    super(`Word already in wordlist: ${entryId}`)
    this.name = 'WordAlreadyExistsError'
  }
}

export async function addWord(supabase: SupabaseClient, draft: WordDraft): Promise<UserWord> {
  // Saving the first word is what creates the account: browsing needs no session,
  // so one is not minted until there is something to own. See lib/supabase/session.
  await ensureSession(supabase)
  // Dictionary-sourced words are deduped by entry_id. RLS scopes the lookup to the
  // current user's rows. Custom words (entryId null) are never treated as duplicates.
  if (draft.entryId) {
    const { data: existing, error: checkError } = await supabase
      .from('user_words').select('id').eq('entry_id', draft.entryId).limit(1)
    if (checkError) throw checkError
    if (existing && existing.length > 0) throw new WordAlreadyExistsError(draft.entryId)
  }
  const { data, error } = await supabase.from('user_words').insert(draftToRow(draft)).select().single()
  // The read above cannot see a request that is still in flight, so two overlapping
  // adds both pass it. `user_words_user_entry_key` (migration 0031) is what actually
  // stops the second one; 23505 is Postgres' unique_violation.
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

/**
 * PostgREST returns at most 1000 rows in one response whatever was asked for, so
 * a bulk insert of more than that inserted everything and reported back a
 * thousand: the list on screen was short by the difference until a reload. Also
 * the unit a failed chunk is retried in, which is why it is not larger.
 */
const INSERT_CHUNK = 500

/** Insert one draft, recovering from the two constraint failures an import can
 *  legitimately hit. Returns null for a word already in the wordlist. */
async function insertOne(supabase: SupabaseClient, draft: WordDraft): Promise<UserWord | null> {
  const { data, error } = await supabase.from('user_words').insert(draftToRow(draft)).select().single()
  if (!error) return parseUserWordRow(data)

  // 23505 unique_violation: `user_words_user_entry_key` (migration 0031). The
  // word is already saved, which for an import is a row to skip, not a failure.
  if (error.code === '23505') return null

  // 23503 foreign_key_violation: the imported entry_id no longer names a row in
  // lex.entries, because the dictionary changed since the backup was written.
  // Keep the word and drop the link -- a restored word without its dictionary
  // link is still the user's word.
  if (error.code === '23503' && draft.entryId !== null) {
    const retry = await supabase.from('user_words')
      .insert(draftToRow({ ...draft, entryId: null })).select().single()
    if (retry.error) throw retry.error
    return parseUserWordRow(retry.data)
  }

  throw error
}

/**
 * Bulk-insert drafts (e.g. from a CSV import).
 *
 * The fast path is one request per chunk. A chunk the database refuses is
 * retried row by row, because a single bad row must not lose the other 499 --
 * which is what the previous shape did in two ways: it retried the whole import
 * with every `entry_id` stripped the moment one link was stale, throwing away
 * the dictionary links of words that were perfectly fine, and it had no answer
 * at all for a duplicate, so one word already in the wordlist failed the lot.
 *
 * Returns the rows that went in. Fewer than were asked for means some were
 * already saved; the caller reports that.
 */
export async function addWords(supabase: SupabaseClient, drafts: WordDraft[]): Promise<UserWord[]> {
  if (drafts.length === 0) return []
  await ensureSession(supabase)

  const inserted: UserWord[] = []
  for (let i = 0; i < drafts.length; i += INSERT_CHUNK) {
    const chunk = drafts.slice(i, i + INSERT_CHUNK)
    const { data, error } = await supabase.from('user_words').insert(chunk.map(draftToRow)).select()
    if (!error) {
      inserted.push(...(data ?? []).map(parseUserWordRow))
      continue
    }
    if (error.code !== '23505' && error.code !== '23503') throw error
    for (const draft of chunk) {
      const row = await insertOne(supabase, draft)
      if (row) inserted.push(row)
    }
  }
  return inserted
}

/** Bulk status change (e.g. "mark selected as known"). Same status for every id, so a
 * single query suffices; unlike tags this needs no per-row merge. */
export async function updateWordsStatus(supabase: SupabaseClient, ids: string[], status: WordStatus): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from('user_words').update({ status }).in('id', ids)
  if (error) throw error
}
