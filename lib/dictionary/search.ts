import type { SupabaseClient } from '@supabase/supabase-js'
import { LANG_CODES, type LangCode } from '@/lib/languages'
import type { DictEntryChip, DictEntryPreview, SuggestionPreview } from './types'
import { entryChipRow, entryIdRow, entryPreviewRow, searchRpcRow, suggestRow, toChip, toPreview, toPreviewFromSearchRow, toSuggestion } from './rows'
import { azureTranslatorConfig } from '@/lib/translate/config'
import { translateCached } from '@/lib/translate/azure'
import { isStructuralMatch, isWordMatch } from './detect'

/**
 * Preview-list queries: `lex.search` (supabase/migrations/0016_search.sql), the Vietnamese
 * reverse lookup `lex.search_vi` and trigram `lex.suggest` (0018_reverse_lookup.sql), and
 * the frequency-ordered "common words" list.
 */

import { CHIP_SELECT, PREVIEW_SELECT } from './entrySelect'

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

type LeadGloss = Pick<DictEntryPreview, 'glossVi' | 'glossEn' | 'levelIsEstimated'>

/** The meaning previews and the word page lead with (`toPreview`), by entry id, in one
 *  query. `lex.search` and `lex.suggest` read the lowest sense_order, so take read "Cầm,
 *  nắm". Any failure answers an empty map and the RPC's own gloss stands. */
async function leadGlosses(supabase: SupabaseClient, ids: string[]): Promise<Map<string, LeadGloss>> {
  if (ids.length === 0) return new Map()
  try {
    const { data, error } = await supabase.schema('lex').from('entries').select(PREVIEW_SELECT).in('id', [...new Set(ids)])
    if (error) throw error
    return new Map(entryPreviewRow.array().parse(data ?? []).map(toPreview)
      .map((p): [string, LeadGloss] => [p.id, { glossVi: p.glossVi, glossEn: p.glossEn, ...(p.levelIsEstimated ? { levelIsEstimated: true } : {}) }]))
  } catch {
    return new Map()
  }
}

function withLead(list: DictEntryPreview[], lead: Map<string, LeadGloss>): DictEntryPreview[] {
  return list.map((e) => ({ ...e, ...lead.get(e.id) }))
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
  /** The translation fallback was due and Azure failed or timed out, so the answer is
   *  incomplete and no cache may keep it. */
  translationFailed?: true
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
 *  Null when nothing was due or nothing new was found; `failed` when Azure or the search
 *  behind it failed, and the native hits then stand on their own. */
async function searchTranslation(
  supabase: SupabaseClient, q: string, native: Record<LangCode, DictEntryPreview[]>,
  perLang: number, langs: readonly LangCode[],
): Promise<Partial<Record<LangCode, TranslatedHits>> | null | 'failed'> {
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
      const hits = (await searchEntries(supabase, l, text.toLowerCase(), perLang))
        .filter((e) => isWordMatch(e) && !seen.has(e.id))
        .slice(0, perLang - native[l].length)
      return hits.length > 0 ? [l, { text, entries: hits }] as const : null
    }))
    const hits = found.filter((f) => f !== null)
    const lead = await leadGlosses(supabase, hits.flatMap(([, h]) => h.entries.map((e) => e.id)))
    const out: Partial<Record<LangCode, TranslatedHits>> = {}
    for (const [l, h] of hits) out[l] = { ...h, entries: withLead(h.entries, lead) }
    return Object.keys(out).length > 0 ? out : null
  } catch {
    return 'failed'
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

  // The Vietnamese direction keeps the sense that matched: "lua" is sense 2 of fire.
  const entries = direction === 'vi'
    ? await searchAllLanguagesVi(supabase, q, perLang, langs)
    : await searchAllLanguages(supabase, q, perLang, langs)
  if (direction === 'fw') {
    const lead = await leadGlosses(supabase, LANG_CODES.flatMap((l) => entries[l].map((e) => e.id)))
    for (const l of LANG_CODES) entries[l] = withLead(entries[l], lead)
  }

  const fallback = direction === 'vi' ? await searchTranslation(supabase, q, entries, perLang, langs) : null
  const failed = fallback === 'failed' ? { translationFailed: true as const } : {}
  const translated = fallback === 'failed' ? null : fallback
  if (translated) return { entries, suggestions: [], translated }
  if (countAll(entries) > 0) return { entries, suggestions: [], ...failed }

  // Offered only from the side the learner is typing on. A Vietnamese query answered with
  // sagrado, divino and santidad under "Có phải bạn tìm" was the previous behaviour, and
  // those three were in fact the correct answer to "thiêng liêng" all along.
  const want = direction === 'vi' ? 'gloss_vi' : 'headword'
  const suggestions = (await suggestNearby(supabase, q)).filter((s) => s.kind === want)
  if (direction === 'vi') return { entries, suggestions, ...failed }
  // A headword guess arrives with lex.suggest's lowest sense_order.
  const lead = await leadGlosses(supabase, suggestions.map((s) => s.id))
  return {
    entries,
    suggestions: suggestions.map((s) => {
      const l = lead.get(s.id)
      return l ? { ...s, glossVi: l.glossVi } : s
    }),
  }
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
   *  important, news, book and friends take their place. A levelled inflection such as
   *  friends goes too, because its lemma is on the list already (`lex.entries.form_of`).
   *  A single letter carries a level too (en m, b, r, c and es p, q, x, b between ranks 301
   *  and 360), so outside Chinese a one-character headword goes as well. */
  leveled?: boolean
}

/** Typed as a plain string: the literal 'id' sends supabase-js's select parser into a type
 *  too deep for tsc once the builder is reassigned (TS2589). */
const ID_SELECT: string = 'id'

/** Most frequent entries for a language (for the per-language "common words" list).
 *  `leveled` feeds the chips on `/dictionary`, so it reads only what a chip draws. */
export async function getCommonWords(
  supabase: SupabaseClient, lang: LangCode, options: CommonWordsOptions & { leveled: true },
): Promise<DictEntryChip[]>
export async function getCommonWords(
  supabase: SupabaseClient, lang: LangCode, options?: CommonWordsOptions & { leveled?: false },
): Promise<DictEntryPreview[]>
export async function getCommonWords(
  supabase: SupabaseClient, lang: LangCode, { limit = 24, offset = 0, leveled = false }: CommonWordsOptions = {},
): Promise<DictEntryChip[] | DictEntryPreview[]> {
  if (leveled) {
    // Ids first, then the embeds for those rows only. In one request PostgREST built the
    // embeds for every row the offset then skipped: 983 ms mean and 58 of 69 statement
    // timeouts from 2026-09-28 to 2026-10-03, against 2,315 buffers for this pair.
    let ids = supabase.schema('lex').from('entries').select(ID_SELECT).eq('lang', lang)
      .not('level', 'is', null).is('form_of', null)
    if (lang !== 'zh') ids = ids.not('headword', 'like', '_')
    const page = await ids
      .order('frequency_rank', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1)
    if (page.error) throw page.error
    const order = entryIdRow.array().parse(page.data ?? []).map((r) => r.id)
    if (order.length === 0) return []
    const { data, error } = await supabase.schema('lex').from('entries').select(CHIP_SELECT).in('id', order)
    if (error) throw error
    const byId = new Map(entryChipRow.array().parse(data ?? []).map((r) => [r.id, toChip(r)]))
    return order.map((id) => byId.get(id)).filter((p): p is DictEntryChip => Boolean(p))
  }
  const { data, error } = await supabase
    .schema('lex')
    .from('entries')
    .select(PREVIEW_SELECT)
    .eq('lang', lang)
    .order('frequency_rank', { ascending: true, nullsFirst: false })
    .range(offset, offset + limit - 1)
  if (error) throw error
  return entryPreviewRow.array().parse(data ?? []).map(toPreview)
}

