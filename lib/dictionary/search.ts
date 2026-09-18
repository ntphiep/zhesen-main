import type { SupabaseClient } from '@supabase/supabase-js'
import { LANG_CODES, type LangCode } from '@/lib/languages'
import { looksHan, looksVietnamese } from './detect'
import type { DictEntryPreview, SuggestionPreview } from './types'
import { entryPreviewRow, searchRpcRow, suggestRow, toPreview, toPreviewFromSearchRow, toSuggestion } from './rows'
import { bestScore } from './response'

/**
 * Preview-list queries: `lex.search` (supabase/migrations/0016_search.sql), the Vietnamese
 * reverse lookup `lex.search_vi` and trigram `lex.suggest` (0018_reverse_lookup.sql), and
 * the frequency-ordered "common words" list.
 */

import { PREVIEW_SELECT } from './entrySelect'

export async function searchEntries(
  supabase: SupabaseClient, lang: LangCode, query: string, limit = 20,
): Promise<DictEntryPreview[]> {
  const q = query.trim()
  if (!q) return []
  const { data, error } = await supabase.schema('lex').rpc('search', { p_q: q, p_langs: [lang], p_limit: limit })
  if (error) throw error
  return searchRpcRow.array().parse(data ?? []).map(toPreviewFromSearchRow)
}

/** Search all supported languages at once, grouped by language (for auto-detect search). */
export async function searchAllLanguages(
  supabase: SupabaseClient, query: string, perLang = 8,
): Promise<Record<LangCode, DictEntryPreview[]>> {
  const q = query.trim()
  if (!q) return { en: [], zh: [], es: [] }
  const [en, zh, es] = await Promise.all([
    searchEntries(supabase, 'en', q, perLang),
    searchEntries(supabase, 'zh', q, perLang),
    searchEntries(supabase, 'es', q, perLang),
  ])
  return { en, zh, es }
}

/** Reverse lookup across all three languages in one RPC. The candidate-gloss scan is the
 *  expensive half of `lex.search_vi` and barely shrinks per language, so three calls pay
 *  for that scan three times. */
export async function searchAllLanguagesVi(
  supabase: SupabaseClient, query: string, perLang = 8,
): Promise<Record<LangCode, DictEntryPreview[]>> {
  const q = query.trim()
  if (!q) return { en: [], zh: [], es: [] }
  const { data, error } = await supabase
    .schema('lex')
    .rpc('search_vi', { p_q: q, p_langs: LANG_CODES, p_limit: perLang * LANG_CODES.length })
  if (error) throw error
  const grouped: Record<LangCode, DictEntryPreview[]> = { en: [], zh: [], es: [] }
  for (const row of searchRpcRow.array().parse(data ?? [])) {
    const bucket = grouped[row.lang]
    if (bucket.length < perLang) bucket.push(toPreviewFromSearchRow(row))
  }
  return grouped
}

/** Trigram-nearest "did you mean...?" candidates, via the `lex.suggest` RPC. */
export async function suggestNearby(
  supabase: SupabaseClient, query: string, limit = 5,
): Promise<SuggestionPreview[]> {
  const q = query.trim()
  if (!q) return []
  const { data, error } = await supabase.schema('lex').rpc('suggest', { p_q: q, p_limit: limit })
  if (error) throw error
  return suggestRow.array().parse(data ?? []).map(toSuggestion)
}

export interface SearchBothDirections {
  /** Direct forward search (query typed in en/es/zh), grouped by language. */
  forward: Record<LangCode, DictEntryPreview[]>
  /** Reverse search (query typed in Vietnamese), grouped by the target language of the
   *  match. Populated only when it was worth attempting. */
  reverse: Record<LangCode, DictEntryPreview[]>
  /** Trigram-nearest suggestions, populated only when both directions came back empty. */
  suggestions: SuggestionPreview[]
}

const EMPTY_BY_LANG: Record<LangCode, DictEntryPreview[]> = { en: [], zh: [], es: [] }

function countAll(byLang: Record<LangCode, DictEntryPreview[]>): number {
  return LANG_CODES.reduce((n, l) => n + byLang[l].length, 0)
}

/** Below this, `lex.search` found no structural match: 4.0 exact headword, 3.5 inflected
 *  form, 3.0 prefix, anything lower a trigram guess. supabase/migrations/0016_search.sql */
const STRUCTURAL_MATCH = 3.0

/** The search box's one field: always forward (en/es/zh), plus the Vietnamese reverse
 *  direction when the query looks Vietnamese or the forward BEST SCORE is below
 *  `STRUCTURAL_MATCH` -- result count would let weak guesses suppress the reverse lookup.
 *  Trigram suggestions only when neither direction found anything. */
export async function searchBothDirections(
  supabase: SupabaseClient, query: string, perLang = 8,
): Promise<SearchBothDirections> {
  const q = query.trim()
  if (!q) return { forward: EMPTY_BY_LANG, reverse: EMPTY_BY_LANG, suggestions: [] }

  // A Han query must skip the reverse lookup: `lex.search` scores a PGroonga match at 1.5,
  // under STRUCTURAL_MATCH, so any inexact Chinese query falls through to `lex.search_vi`
  // for 780 to 1,195 ms and zero rows (measured on 習), and production answered 500 past
  // the statement timeout (SQLSTATE 57014).
  //
  // A Vietnamese diacritic decides the reverse lookup without any forward result, so the
  // two run together. Measured in production: 334 to 4,078 ms for a Vietnamese query
  // against 176 to 513 ms for an English, Spanish or Chinese one.
  const reverseIsCertain = !looksHan(q) && looksVietnamese(q)
  const [forward, eagerReverse] = await Promise.all([
    searchAllLanguages(supabase, q, perLang),
    reverseIsCertain ? searchAllLanguagesVi(supabase, q, perLang) : null,
  ])
  const reverse = eagerReverse
    ?? (!looksHan(q) && bestScore(forward) < STRUCTURAL_MATCH
      ? await searchAllLanguagesVi(supabase, q, perLang)
      : EMPTY_BY_LANG)

  const suggestions = countAll(forward) === 0 && countAll(reverse) === 0
    ? await suggestNearby(supabase, q)
    : []

  return { forward, reverse, suggestions }
}

/** Most frequent entries for a language (for the per-language "common words" list). */
export async function getCommonWords(
  supabase: SupabaseClient, lang: LangCode, limit = 24,
): Promise<DictEntryPreview[]> {
  const { data, error } = await supabase
    .schema('lex')
    .from('entries')
    .select(PREVIEW_SELECT)
    .eq('lang', lang)
    .order('frequency_rank', { ascending: true, nullsFirst: false })
    .limit(limit)
  if (error) throw error
  return entryPreviewRow.array().parse(data ?? []).map(toPreview)
}

