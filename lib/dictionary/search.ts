import type { SupabaseClient } from '@supabase/supabase-js'
import { LANG_CODES, type LangCode } from '@/lib/languages'
import { looksVietnamese } from './detect'
import type { DictEntryPreview, SuggestionPreview } from './types'
import { entryPreviewRow, searchRpcRow, suggestRow, toPreview, toPreviewFromSearchRow, toSuggestion } from './rows'

/**
 * Preview-list queries: full-text/fuzzy search (backed by the `lex.search` RPC,
 * see supabase/migrations/0016_search.sql), the Vietnamese -> en/es/zh reverse
 * lookup (`lex.search_vi`, trigram "did you mean" (`lex.suggest`), both from
 * supabase/migrations/0018_reverse_lookup.sql), and the plain frequency-ordered
 * "common words" list.
 *
 * This file also re-exports the rest of the dictionary data-layer's public
 * surface (row mapping, text-quality helpers, token resolution, entry detail)
 * so every existing `@/lib/dictionary/search` import keeps working -- the
 * implementations now live in smaller, responsibility-grouped files instead of
 * one 384-line file.
 */

export const PREVIEW_SELECT =
  'id, lang, headword, traditional, level, frequency_rank, attributes, senses(pos, gloss_vi, gloss_en, sense_order), pronunciations(accent, ipa, audio_url)'

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

/** Reverse lookup: Vietnamese query -> matching en/es/zh entries, via the
 * `lex.search_vi` RPC (see supabase/migrations/0018_reverse_lookup.sql). */
export async function searchEntriesVi(
  supabase: SupabaseClient, lang: LangCode, query: string, limit = 20,
): Promise<DictEntryPreview[]> {
  const q = query.trim()
  if (!q) return []
  const { data, error } = await supabase.schema('lex').rpc('search_vi', { p_q: q, p_langs: [lang], p_limit: limit })
  if (error) throw error
  return searchRpcRow.array().parse(data ?? []).map(toPreviewFromSearchRow)
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
 * The second test used to be "found nothing at all", which missed the common
 * case: "nhà" and "con mèo" carry only à and è, which Spanish uses too, so
 * `looksVietnamese` rightly declines to claim them — and the forward search
 * returned a handful of trigram guesses scoring under 1.0, which counted as
 * "found something" and suppressed the reverse lookup entirely. Both words then
 * came back with nothing useful even though the reverse lookup answers them.
 * Measuring the best score instead spends the extra round trip exactly on the
 * queries that have nothing else to show.
 *
 * Falls back to trigram "did you mean" suggestions only when neither direction
 * found anything, so that extra RPC round-trip stays rare.
 */
export async function searchBothDirections(
  supabase: SupabaseClient, query: string, perLang = 8,
): Promise<SearchBothDirections> {
  const q = query.trim()
  if (!q) return { forward: EMPTY_BY_LANG, reverse: EMPTY_BY_LANG, suggestions: [] }

  const forward = await searchAllLanguages(supabase, q, perLang)
  const shouldTryReverse = looksVietnamese(q) || bestScore(forward) < STRUCTURAL_MATCH
  const reverse = shouldTryReverse ? await searchAllLanguagesVi(supabase, q, perLang) : EMPTY_BY_LANG

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

export { pickIpa, pickPrimarySense } from './rows'
export { cleanMtGloss, pickSenses, fillPivotVi, isClassifierGloss, parseClassifiers, isCleanExample } from './textQuality'
export { resolveTokens, getZhSegmentCandidates } from './resolveTokens'
export { getEntryDetail, getCrossLanguage, getInflections, getTermPreviews, getCharacters } from './entryDetail'
