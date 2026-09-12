import type { SupabaseClient } from '@supabase/supabase-js'
import type { DictEntryPreview } from '@/lib/dictionary/types'
import type { LangCode } from '@/lib/languages'
import { userWordRow, type UserWord, type WordDraft, type WordStatus } from './types'
import { z } from 'zod'
import { fetchAllRows } from '@/lib/supabase/paginate'

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

export function draftFromDictEntry(e: DictEntryPreview): WordDraft {
  return {
    lang: e.lang, entryId: e.id, headword: e.headword, reading: null, ipa: e.ipa, pos: e.pos,
    meaningVi: e.glossVi, meaningEn: e.glossEn, level: e.level, example: null, exampleTranslation: null,
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
  // Dictionary-sourced words are deduped by entry_id. RLS scopes the lookup to the
  // current user's rows. Custom words (entryId null) are never treated as duplicates.
  if (draft.entryId) {
    const { data: existing, error: checkError } = await supabase
      .from('user_words').select('id').eq('entry_id', draft.entryId).limit(1)
    if (checkError) throw checkError
    if (existing && existing.length > 0) throw new WordAlreadyExistsError(draft.entryId)
  }
  const { data, error } = await supabase.from('user_words').insert(draftToRow(draft)).select().single()
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
  const { data, error } = await supabase.from('user_words').insert(drafts.map(draftToRow)).select()
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
