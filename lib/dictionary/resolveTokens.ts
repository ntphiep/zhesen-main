import type { SupabaseClient } from '@supabase/supabase-js'
import type { LangCode } from '@/lib/languages'
import type { DictEntryPreview } from './types'
import { entryPreviewRow, inflectionEntryLookupRow, headwordRow, toPreview } from './rows'
import { PREVIEW_SELECT } from './entrySelect'

/**
 * Resolve word tokens to dictionary entries for tap-to-lookup. Matches the
 * lowercased token against `headword_normalized`, then (for the rest) against
 * inflected forms in `lex.inflections`. Returns a map keyed by lowercased token.
 */
export async function resolveTokens(
  supabase: SupabaseClient, lang: LangCode, tokens: string[],
): Promise<Map<string, DictEntryPreview>> {
  const lowered = [...new Set(tokens.map((t) => t.toLowerCase()).filter(Boolean))]
  const out = new Map<string, DictEntryPreview>()
  if (lowered.length === 0) return out

  const direct = await supabase.schema('lex').from('entries')
    .select(PREVIEW_SELECT).eq('lang', lang).in('headword_normalized', lowered)
  if (direct.error) throw direct.error
  for (const row of entryPreviewRow.array().parse(direct.data ?? [])) {
    out.set(row.headword.toLowerCase(), toPreview(row))
  }

  const remaining = lowered.filter((t) => !out.has(t))
  if (remaining.length === 0) return out

  // Through the function, not through `.in('form_text', ...)`. `lex.inflections`
  // has no index on the raw column, so the filtered form read all 352,332 rows:
  // `explain (analyze)` gives a Parallel Seq Scan at 1709 ms, and Postgres has
  // already cancelled it once with SQLSTATE 57014 while a build warmed this
  // cache. `lex.resolve_inflections` asks the same question in the shape
  // `idx_lex_infl_form_norm` was built in and measures 65 ms on the same input.
  // It also filters by language itself, and picks the most frequent entry when a
  // form belongs to several -- Spanish `fue` is an inflection of both `ser` and
  // `ir`, and the old code kept whichever row came back first.
  const infl = await supabase.schema('lex')
    .rpc('resolve_inflections', { p_lang: lang, p_forms: remaining })
  if (infl.error) throw infl.error
  const inflRows = inflectionEntryLookupRow.array().parse(infl.data ?? [])
  if (inflRows.length === 0) return out

  const ids = [...new Set(inflRows.map((r) => r.entry_id))]
  const ent = await supabase.schema('lex').from('entries')
    .select(PREVIEW_SELECT).in('id', ids)
  if (ent.error) throw ent.error
  const byId = new Map<string, DictEntryPreview>()
  for (const row of entryPreviewRow.array().parse(ent.data ?? [])) byId.set(row.id, toPreview(row))
  for (const r of inflRows) {
    const p = byId.get(r.entry_id)
    if (p && !out.has(r.form_text)) out.set(r.form_text, p)
  }
  return out
}

const HAN = /\p{Script=Han}/u
// Longest real zh headword seen in the data is 5 chars (e.g. "有限公司"); a
// generous cap keeps the candidate set small without risking a miss.
const MAX_ZH_HEADWORD_LEN = 8

/** Contiguous-Han substrings of length >= 2 in `text` -- the only strings that
 * could possibly match a multi-character zh headword. Single characters are
 * deliberately excluded: `tokenizeHan` already falls back to a one-character word
 * when no longer match is found, so they don't need to be fetched to segment
 * correctly (resolveTokens looks each resulting token up separately anyway). */
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

/**
 * zh headwords that could plausibly appear in `text`, for `tokenize(lang, text,
 * headwords)`'s greedy longest-match segmentation. Replaces the old
 * `getHeadwords`, which downloaded every zh headword in the database (the whole
 * `lex.entries` table for lang='zh') on every render; this instead asks the
 * server only for the handful of substrings that are actually present in the
 * text being tokenized, using the existing `(lang, headword_normalized)` index.
 */
export async function getZhSegmentCandidates(supabase: SupabaseClient, text: string): Promise<string[]> {
  return getZhSegmentCandidatesForTexts(supabase, [text])
}

/** The same, for several texts in one round trip. A headword that belongs to
 * another text simply never matches during segmentation, so the union is safe to
 * hand to every `tokenize` call. */
export async function getZhSegmentCandidatesForTexts(
  supabase: SupabaseClient, texts: string[],
): Promise<string[]> {
  const candidates = [...new Set(texts.flatMap(hanSubstrings))]
  if (candidates.length === 0) return []
  const { data, error } = await supabase.schema('lex').from('entries')
    .select('headword').eq('lang', 'zh').in('headword_normalized', candidates)
  if (error) throw error
  return headwordRow.array().parse(data ?? []).map((r) => r.headword)
}
