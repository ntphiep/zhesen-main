import type { SupabaseClient } from '@supabase/supabase-js'
import { LANG_CODES, type LangCode } from '@/lib/languages'
import type { DictEntryPreview, SuggestionPreview } from './types'
import { entryPreviewRow, searchRpcRow, suggestRow, toPreview, toPreviewFromSearchRow, toSuggestion } from './rows'
import { azureTranslatorConfig } from '@/lib/translate/config'
import { translateCached } from '@/lib/translate/azure'
import { isStructuralMatch } from './detect'

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

/** Search the requested languages at once, grouped by language.
 *  A language left out is not queried: the caller asked for one, so three round trips
 *  would be two answers nobody reads.
 *
 *  A trigram guess is kept only where no language matched structurally. Each language is
 *  its own RPC and each fills its own quota, so "fish" used to fill the Spanish column
 *  with fiscal (rank 1.58) and fi (1.17) beside the eight real English hits. A genuine
 *  misspelling matches nothing anywhere, so the spell-check path is untouched: `recieve`
 *  reaches `receive` on a similarity of 0.333, the same figure as the noise, which is why
 *  the threshold cannot do this job. */
export async function searchAllLanguages(
  supabase: SupabaseClient, query: string, perLang = 8, langs: readonly LangCode[] = LANG_CODES,
): Promise<Record<LangCode, DictEntryPreview[]>> {
  const out: Record<LangCode, DictEntryPreview[]> = { en: [], zh: [], es: [] }
  const q = query.trim()
  if (!q) return out
  const found = await Promise.all(langs.map((l) => searchEntries(supabase, l, q, perLang)))
  const structural = found.some((list) => list.some(isStructuralMatch))
  langs.forEach((l, i) => { out[l] = structural ? found[i].filter(isStructuralMatch) : found[i] })
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

/** Entries found by searching one language for the machine translation of the query. */
export interface TranslatedHits {
  text: string
  entries: DictEntryPreview[]
}

export interface SearchOneDirection {
  /** Grouped by language. For `vi` that is the language the answer is written in. */
  entries: Record<LangCode, DictEntryPreview[]>
  /** Trigram-nearest suggestions, populated only when `entries` came back empty, and only
   *  from the side this direction searches. */
  suggestions: SuggestionPreview[]
  /** `vi` only: what the translation of the query found in a language with few native
   *  hits, never repeating one of them. */
  translated?: Partial<Record<LangCode, TranslatedHits>>
}

/** A Vietnamese lookup with fewer native hits than this in a language is also searched
 *  through its machine translation. The smallest value that reaches a two-hit column, which
 *  is where the misses sit: measured on 60 queries against production, "trường" answered
 *  only field and "hội nghị" assembly and con, with no school or conference. At 3 the
 *  English column falls back on 13 of the 60. */
const TRANSLATE_BELOW = 3
/** The fallback is an extra: a slow Azure answer gives it up rather than hold the lookup. */
const TRANSLATE_TIMEOUT_MS = 3000

/** Search each weak language for the query's machine translation, in one Azure request.
 *  Any failure answers null: the native hits stand on their own. */
async function searchTranslation(
  supabase: SupabaseClient, q: string, native: Record<LangCode, DictEntryPreview[]>,
  perLang: number, langs: readonly LangCode[],
): Promise<Partial<Record<LangCode, TranslatedHits>> | null> {
  const weak = langs.filter((l) => native[l].length < TRANSLATE_BELOW)
  if (weak.length === 0) return null
  const cfg = await azureTranslatorConfig()
  if (!cfg) return null
  try {
    const { translations } = await translateCached(cfg, q, 'vi', weak, AbortSignal.timeout(TRANSLATE_TIMEOUT_MS))
    const found = await Promise.all(weak.map(async (l) => {
      const text = translations[l]?.trim().replace(/[.。]$/, '')
      if (!text) return null
      const seen = new Set(native[l].map((e) => e.id))
      // Structural matches only: a trigram guess for a translation is a guess of a guess.
      const hits = (await searchEntries(supabase, l, text.toLowerCase(), perLang))
        .filter((e) => isStructuralMatch(e) && !seen.has(e.id))
        .slice(0, perLang - native[l].length)
      return hits.length > 0 ? [l, { text, entries: hits }] as const : null
    }))
    const out: Partial<Record<LangCode, TranslatedHits>> = {}
    for (const f of found) if (f) out[f[0]] = f[1]
    return Object.keys(out).length > 0 ? out : null
  } catch {
    return null
  }
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

  const translated = direction === 'vi' ? await searchTranslation(supabase, q, entries, perLang, langs) : null
  if (translated) return { entries, suggestions: [], translated }
  if (countAll(entries) > 0) return { entries, suggestions: [] }

  // Offered only from the side the learner is typing on. A Vietnamese query answered with
  // sagrado, divino and santidad under "Có phải bạn tìm" was the previous behaviour, and
  // those three were in fact the correct answer to "thiêng liêng" all along.
  const want = direction === 'vi' ? 'gloss_vi' : 'headword'
  const suggestions = (await suggestNearby(supabase, q)).filter((s) => s.kind === want)
  return { entries, suggestions }
}

export interface CommonWordsOptions {
  limit?: number
  /** How far down the frequency list to start. Rank 1 to 300 is almost entirely function
   *  words -- the, to, and, of, de, la, que, 的, 是, 在 -- true answers to "most frequent"
   *  and useless as something to tap. */
  offset?: number
  /** Keep only entries carrying a CEFR or HSK level. Those are the curated part of the
   *  corpus, so it drops the scraped single letters and bare inflections that otherwise
   *  sit between the real words: measured at rank 301, "d", "makes" and "using" go and
   *  important, news, book and friends take their place. */
  leveled?: boolean
}

/** Most frequent entries for a language (for the per-language "common words" list). */
export async function getCommonWords(
  supabase: SupabaseClient, lang: LangCode, { limit = 24, offset = 0, leveled = false }: CommonWordsOptions = {},
): Promise<DictEntryPreview[]> {
  let query = supabase
    .schema('lex')
    .from('entries')
    .select(PREVIEW_SELECT)
    .eq('lang', lang)
  if (leveled) query = query.not('level', 'is', null)
  const { data, error } = await query
    .order('frequency_rank', { ascending: true, nullsFirst: false })
    .range(offset, offset + limit - 1)
  if (error) throw error
  return entryPreviewRow.array().parse(data ?? []).map(toPreview)
}

