import type { SupabaseClient } from '@supabase/supabase-js'
import { LANG_CODES, type LangCode } from '@/lib/languages'
import type { DictEntryPreview, SuggestionPreview } from './types'
import { entryPreviewRow, searchRpcRow, suggestRow, toPreview, toPreviewFromSearchRow, toSuggestion } from './rows'

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

/** Search the requested languages at once, grouped by language (for auto-detect search).
 *  A language left out is not queried: the caller asked for one, so three round trips
 *  would be two answers nobody reads. */
export async function searchAllLanguages(
  supabase: SupabaseClient, query: string, perLang = 8, langs: readonly LangCode[] = LANG_CODES,
): Promise<Record<LangCode, DictEntryPreview[]>> {
  const out: Record<LangCode, DictEntryPreview[]> = { en: [], zh: [], es: [] }
  const q = query.trim()
  if (!q) return out
  const found = await Promise.all(langs.map((l) => searchEntries(supabase, l, q, perLang)))
  langs.forEach((l, i) => { out[l] = found[i] })
  return out
}

/** Reverse lookup across all three languages in one RPC. The candidate-gloss scan is the
 *  expensive half of `lex.search_vi` and barely shrinks per language, so three calls pay
 *  for that scan three times.
 *
 *  `p_limit` counts per language since 0047. Before that one budget covered all three and
 *  the strongest language took it: "di bo" returned 16 English rows, 7 Spanish and 1
 *  Chinese, and this function then discarded 8 of the English ones. */
export async function searchAllLanguagesVi(
  supabase: SupabaseClient, query: string, perLang = 8, langs: readonly LangCode[] = LANG_CODES,
): Promise<Record<LangCode, DictEntryPreview[]>> {
  const q = query.trim()
  if (!q || langs.length === 0) return { en: [], zh: [], es: [] }
  const { data, error } = await supabase
    .schema('lex')
    .rpc('search_vi', { p_q: q, p_langs: langs, p_limit: perLang })
  // A timeout is not an empty dictionary, and it must not be answered as one. Swallowing
  // SQLSTATE 57014 here was tried and measured: "cái bàn" costs 122 ms warm and returns
  // table, tables, mesa and tabla, but on a cold read it crossed the 3 s the anon role
  // allows, and the learner was shown a page saying their word is in no language. The
  // route turns this into a 503 that says to try again.
  if (error) throw error
  const grouped: Record<LangCode, DictEntryPreview[]> = { en: [], zh: [], es: [] }
  for (const row of searchRpcRow.array().parse(data ?? [])) grouped[row.lang].push(toPreviewFromSearchRow(row))
  return grouped
}

/** Trigram-nearest "did you mean...?" candidates, via the `lex.suggest` RPC. `lex.suggest`
 *  searches headwords and Vietnamese glosses at once and labels each row with the side it
 *  matched, so the caller keeps only the side it asked about. */
export async function suggestNearby(
  supabase: SupabaseClient, query: string, limit = 5,
): Promise<SuggestionPreview[]> {
  const q = query.trim()
  if (!q) return []
  const { data, error } = await supabase.schema('lex').rpc('suggest', { p_q: q, p_limit: limit })
  if (error) throw error
  return suggestRow.array().parse(data ?? []).map(toSuggestion)
}

/** Which way round the lookup runs. The learner chooses it by which box they type in, so
 *  nothing is guessed from the text: "an", "ban" and "con" are real English and Spanish
 *  headwords as well as Vietnamese words, and no rule can separate them. */
export type Direction = 'vi' | 'fw'

export interface SearchOneDirection {
  /** Grouped by language. For `vi` that is the language the answer is written in. */
  entries: Record<LangCode, DictEntryPreview[]>
  /** Trigram-nearest suggestions, populated only when `entries` came back empty, and only
   *  from the side this direction searches. */
  suggestions: SuggestionPreview[]
}

const EMPTY_BY_LANG: Record<LangCode, DictEntryPreview[]> = { en: [], zh: [], es: [] }

function countAll(byLang: Record<LangCode, DictEntryPreview[]>): number {
  return LANG_CODES.reduce((n, l) => n + byLang[l].length, 0)
}

/**
 * One lookup, one direction, one round trip.
 *
 * The previous shape ran both directions and let a score decide which to show. That cost a
 * second Supabase call on every weak forward match and still answered "cá" with ca, can and
 * called, because the forward search scored a real English headword above the threshold and
 * the Vietnamese direction never ran. Two input boxes remove the guess entirely.
 */
export async function searchOneDirection(
  supabase: SupabaseClient,
  query: string,
  direction: Direction,
  perLang = 8,
  langs: readonly LangCode[] = LANG_CODES,
): Promise<SearchOneDirection> {
  const q = query.trim()
  if (!q || langs.length === 0) return { entries: EMPTY_BY_LANG, suggestions: [] }

  const entries = direction === 'vi'
    ? await searchAllLanguagesVi(supabase, q, perLang, langs)
    : await searchAllLanguages(supabase, q, perLang, langs)

  if (countAll(entries) > 0) return { entries, suggestions: [] }

  // Offered only from the side the learner is typing on. A Vietnamese query answered with
  // sagrado, divino and santidad under "Có phải bạn tìm" was the previous behaviour, and
  // those three were in fact the correct answer to "thiêng liêng" all along.
  const want = direction === 'vi' ? 'gloss_vi' : 'headword'
  const suggestions = (await suggestNearby(supabase, q)).filter((s) => s.kind === want)
  return { entries, suggestions }
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

