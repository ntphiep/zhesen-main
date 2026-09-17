import type { SupabaseClient } from '@supabase/supabase-js'
import { LANG_CODES, type LangCode } from '@/lib/languages'
import { looksHan, looksVietnamese } from './detect'
import type { DictEntryPreview, SuggestionPreview } from './types'
import { entryPreviewRow, searchRpcRow, suggestRow, toPreview, toPreviewFromSearchRow, toSuggestion } from './rows'

/**
 * Preview-list queries: full-text/fuzzy search (backed by the `lex.search` RPC,
 * see supabase/migrations/0016_search.sql), the Vietnamese -> en/es/zh reverse
 * lookup (`lex.search_vi`, trigram "did you mean" (`lex.suggest`), both from
 * supabase/migrations/0018_reverse_lookup.sql), and the plain frequency-ordered
 * "common words" list.
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

/**
 * Reverse lookup across all three languages at once, grouped by language.
 *
 * One RPC call rather than three. The scan that finds candidate glosses is the
 * expensive half of `lex.search_vi` and it barely shrinks when the language is
 * narrowed, so asking per language paid for that scan three times over.
 */
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
  /** Reverse search (query typed in Vietnamese), grouped by the *target*
   * language of the match. Only populated when it was worth attempting --
   * see the rule below. */
  reverse: Record<LangCode, DictEntryPreview[]>
  /** Trigram-nearest suggestions, populated only when both directions above
   * came back completely empty. */
  suggestions: SuggestionPreview[]
}

const EMPTY_BY_LANG: Record<LangCode, DictEntryPreview[]> = { en: [], zh: [], es: [] }

function countAll(byLang: Record<LangCode, DictEntryPreview[]>): number {
  return LANG_CODES.reduce((n, l) => n + byLang[l].length, 0)
}

function bestScore(byLang: Record<LangCode, DictEntryPreview[]>): number {
  return Math.max(0, ...LANG_CODES.flatMap((l) => byLang[l]).map((e) => e.matchScore ?? 0))
}

/**
 * Below this, `lex.search` found no structural match at all — the tiers are 4.0
 * for an exact headword, 3.5 for an inflected form and 3.0 for a prefix, and
 * anything under 3.0 is a trigram guess. See supabase/migrations/0016_search.sql.
 */
const STRUCTURAL_MATCH = 3.0

/**
 * Single entry point for the search box's one search field: always searches
 * forward (en/es/zh), and additionally searches the Vietnamese reverse
 * direction when the query looks Vietnamese (diacritics unique to Vietnamese,
 * see `looksVietnamese`) or the forward search turned up nothing better than a
 * guess.
 *
 * The second test measures the best score, not the result count: a forward
 * search can return trigram guesses scoring under `STRUCTURAL_MATCH` for a
 * query `looksVietnamese` rightly declines to claim, and a handful of weak
 * guesses must not count as "found something" and suppress the reverse lookup.
 *
 * Falls back to trigram "did you mean" suggestions only when neither direction
 * found anything, so that extra RPC round-trip stays rare.
 */
export async function searchBothDirections(
  supabase: SupabaseClient, query: string, perLang = 8,
): Promise<SearchBothDirections> {
  const q = query.trim()
  if (!q) return { forward: EMPTY_BY_LANG, reverse: EMPTY_BY_LANG, suggestions: [] }

  // A Han query is never Vietnamese, so the reverse lookup has nothing to find.
  // Skipping it is not an optimisation but a fix: `lex.search` scores a PGroonga
  // match at 1.5, under STRUCTURAL_MATCH, so every Chinese query that is not an
  // exact headword used to fall through to `lex.search_vi`. Measured on 習 (which
  // finds 学习 through the traditional form): 780 to 1,195 ms for zero rows, and
  // production answered the search route with 500 when it crossed the statement
  // timeout (SQLSTATE 57014).
  //
  // A query carrying a Vietnamese diacritic decides that on its own, without
  // seeing a single forward result, so the two run together instead of one after
  // the other. Only the second test needs the forward scores, and it is the one
  // that fires for a query in no particular language. Measured through production:
  // a Vietnamese query cost 334 to 4,078 ms against 176 to 513 ms for an English,
  // Spanish or Chinese one, and the forward search it was queued behind is the
  // part it never uses.
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

