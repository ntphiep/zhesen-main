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

/** Bulk-insert drafts (e.g. from a CSV import). No duplicate check: the caller (the
 * import preview) has already deduped against the current wordlist and within the file. */
export async function addWords(supabase: SupabaseClient, drafts: WordDraft[]): Promise<UserWord[]> {
  if (drafts.length === 0) return []
  await ensureSession(supabase)
  const { data, error } = await supabase.from('user_words').insert(drafts.map(draftToRow)).select()
  // 23503 is foreign_key_violation: an imported entry_id no longer names a row in
  // lex.entries, because the dictionary changed since the backup was written. One
  // such row would otherwise fail the whole import, so drop the dictionary links and
  // keep the words -- a restored word without its link is still the user's word.
  if (error?.code === '23503') {
    const retry = await supabase.from('user_words')
      .insert(drafts.map((d) => draftToRow({ ...d, entryId: null }))).select()
    if (retry.error) throw retry.error
    return (retry.data ?? []).map(parseUserWordRow)
  }
  if (error) throw error
  return (data ?? []).map(parseUserWordRow)
}

/** Bulk status change (e.g. "mark selected as known"). Same status for every id, so a
 * single query suffices; unlike tags this needs no per-row merge. */
export async function updateWordsStatus(supabase: SupabaseClient, ids: string[], status: WordStatus): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from('user_words').update({ status }).in('id', ids)
  if (error) throw error
}
