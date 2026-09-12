import type { SupabaseClient } from '@supabase/supabase-js'
import type { LangCode } from '@/lib/languages'
import type { DictEntryPreview } from './types'
import { entryPreviewRow, searchRpcRow, toPreview, toPreviewFromSearchRow } from './rows'

/**
 * Preview-list queries: full-text/fuzzy search (backed by the `lex.search` RPC,
 * see supabase/migrations/0016_search.sql) and the plain frequency-ordered
 * "common words" list.
 *
 * This file also re-exports the rest of the dictionary data-layer's public
 * surface (row mapping, text-quality helpers, token resolution, entry detail)
 * so every existing `@/lib/dictionary/search` import keeps working -- the
 * implementations now live in smaller, responsibility-grouped files instead of
 * one 384-line file.
 */

const PREVIEW_SELECT =
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
export { getEntryDetail, getCrossLanguage, getInflections, getCharacters } from './entryDetail'
