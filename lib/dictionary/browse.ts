import type { SupabaseClient } from '@supabase/supabase-js'
import type { LangCode } from '@/lib/languages'
import type { DictEntryPreview } from './types'
import { entryPreviewRow, toPreview } from './rows'
import { PREVIEW_SELECT } from './entrySelect'

/**
 * "Browse the dictionary by first letter" data for `/dictionary/browse/[lang]/[letter]`.
 *
 * The letter is matched as a range rather than with `like`, so the btree
 * `lex_entries_lang_headword_idx` on `(lang, headword_normalized)` answers it: measured on
 * production, `lang = 'en'` over the k range is an index scan returning 226 rows.
 */

export const BROWSE_LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('')

export function isBrowseLetter(value: string): boolean {
  return BROWSE_LETTERS.includes(value)
}

/** Chinese headwords carry no Latin letter, so the range runs over the pinyin instead:
 *  every one of the 4,045 zh entries has `pinyin_toneless`, and none of the 32,316 en and
 *  es entries has it. */
function rangeColumn(lang: LangCode): string {
  return lang === 'zh' ? 'pinyin_toneless' : 'headword_normalized'
}

/** The letter after `letter`. 'z' has none, so the upper bound is the character above it,
 *  which no headword can start with. */
function upperBound(letter: string): string {
  return String.fromCharCode(letter.charCodeAt(0) + 1)
}

export interface LetterPage {
  items: DictEntryPreview[]
  total: number
}

/** One page of entries whose first letter is `letter`, most frequent first, because a
 *  learner opening "k" wants keep and kitchen before kaleidoscope. */
export async function getEntriesByLetter(
  supabase: SupabaseClient, lang: LangCode, letter: string, offset = 0, limit = 60,
): Promise<LetterPage> {
  const column = rangeColumn(lang)
  const { data, error, count } = await supabase
    .schema('lex').from('entries').select(PREVIEW_SELECT, { count: 'exact' })
    .eq('lang', lang)
    .gte(column, letter)
    .lt(column, upperBound(letter))
    .order('frequency_rank', { ascending: true, nullsFirst: false })
    .order('id')
    .range(offset, offset + limit - 1)
  if (error) throw error
  return { items: entryPreviewRow.array().parse(data ?? []).map(toPreview), total: count ?? 0 }
}
