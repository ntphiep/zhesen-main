import type { SupabaseClient } from '@supabase/supabase-js'
import type { LangCode } from '@/lib/languages'
import type { DictEntryPreview } from './types'
import { entryPreviewRow, inflectionEntryLookupRow, headwordRow, toPreview } from './rows'
import { PREVIEW_SELECT } from './entrySelect'
import { fetchInChunks } from '@/lib/supabase/paginate'

/** Resolve word tokens to dictionary entries for tap-to-lookup: lowercased token against
 *  `headword_normalized`, then the rest against `lex.inflections`. Keyed by lowercased
 *  token. */
export async function resolveTokens(
  supabase: SupabaseClient, lang: LangCode, tokens: string[],
): Promise<Map<string, DictEntryPreview>> {
  const lowered = [...new Set(tokens.map((t) => t.toLowerCase()).filter(Boolean))]
  const out = new Map<string, DictEntryPreview>()
  if (lowered.length === 0) return out

  const direct = await fetchInChunks<unknown>(lowered, (chunk) => supabase.schema('lex').from('entries')
    .select(PREVIEW_SELECT).eq('lang', lang).in('headword_normalized', chunk))
  for (const row of entryPreviewRow.array().parse(direct)) {
    out.set(row.headword.toLowerCase(), toPreview(row))
  }

  const remaining = lowered.filter((t) => !out.has(t))
  if (remaining.length === 0) return out

  // Through the function, never `.in('form_text', ...)`: `lex.inflections` has no index on
  // the raw column, so the filter reads all 352,332 rows in a Parallel Seq Scan at 1709 ms
  // and Postgres cancelled it once with SQLSTATE 57014. `lex.resolve_inflections` fits
  // `idx_lex_infl_form_norm` at 65 ms, filters by language, and picks the most frequent
  // entry when a form belongs to several (Spanish `fue` inflects both `ser` and `ir`).
  const infl = await supabase.schema('lex')
    .rpc('resolve_inflections', { p_lang: lang, p_forms: remaining })
  if (infl.error) throw infl.error
  const inflRows = inflectionEntryLookupRow.array().parse(infl.data ?? [])
  if (inflRows.length === 0) return out

  const ids = [...new Set(inflRows.map((r) => r.entry_id))]
  const ent = await fetchInChunks<unknown>(ids, (chunk) => supabase.schema('lex').from('entries')
    .select(PREVIEW_SELECT).in('id', chunk))
  const byId = new Map<string, DictEntryPreview>()
  for (const row of entryPreviewRow.array().parse(ent)) byId.set(row.id, toPreview(row))
  for (const r of inflRows) {
    const p = byId.get(r.entry_id)
    if (p && !out.has(r.form_text)) out.set(r.form_text, p)
  }
  return out
}

const HAN = /\p{Script=Han}/u
// Longest real zh headword in the data is 5 characters; the cap keeps the candidate set
// small without risking a miss.
const MAX_ZH_HEADWORD_LEN = 8

/** Contiguous-Han substrings of length >= 2 in `text`, the only strings that can match a
 *  multi-character zh headword. Single characters are excluded because `tokenizeHan`
 *  already falls back to a one-character word when no longer match is found. */
function hanSubstrings(text: string): string[] {
  const chars = [...text]
  const out = new Set<string>()
  for (let i = 0; i < chars.length; i++) {
    if (!HAN.test(chars[i])) continue
    let run = chars[i]
    for (let j = i + 1; j < chars.length && j < i + MAX_ZH_HEADWORD_LEN && HAN.test(chars[j]); j++) {
      run += chars[j]
      out.add(run)
    }
  }
  return [...out]
}

/** zh headwords that could appear in `text`, for `tokenize`'s greedy longest-match
 *  segmentation. Asks only for substrings present in the text, over the existing
 *  `(lang, headword_normalized)` index. */
export async function getZhSegmentCandidates(supabase: SupabaseClient, text: string): Promise<string[]> {
  return getZhSegmentCandidatesForTexts(supabase, [text])
}

/** The same, for several texts in one round trip. A headword belonging to another text
 *  never matches during segmentation, so the union is safe for every `tokenize` call. */
export async function getZhSegmentCandidatesForTexts(
  supabase: SupabaseClient, texts: string[],
): Promise<string[]> {
  const candidates = [...new Set(texts.flatMap(hanSubstrings))]
  if (candidates.length === 0) return []
  const rows = await fetchInChunks<unknown>(candidates, (chunk) => supabase.schema('lex').from('entries')
    .select('headword').eq('lang', 'zh').in('headword_normalized', chunk))
  return headwordRow.array().parse(rows).map((r) => r.headword)
}
