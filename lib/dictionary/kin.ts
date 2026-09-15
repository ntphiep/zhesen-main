import type { SupabaseClient } from '@supabase/supabase-js'
import { searchEntries } from './search'
import type { DictEntryPreview } from './types'
import type { LangCode } from '@/lib/languages'

/**
 * The words built on the same stem: adjourn -> adjourned, adjourning, adjournment,
 * adjourns.
 *
 * `lex.lex_relations` was supposed to answer this and mostly cannot -- it holds no
 * row at all for `en:adjourned` -- so a page for an inflected word showed the two
 * junk comparatives ("more adjourned", "most adjourned") and nothing else. The
 * stem is already searchable: `lex.search` ranks an exact headword above a prefix
 * match, and a prefix match is exactly what a derived word is. Asking it with the
 * stem and keeping only the prefixes costs no new SQL.
 *
 * Chinese is excluded by the caller: a prefix of a Chinese headword is a compound,
 * which `getEntriesContaining` already answers with the right ranking.
 */
export async function getWordKin(
  supabase: SupabaseClient, lang: LangCode, stem: string, headword: string, limit = 12,
): Promise<DictEntryPreview[]> {
  const s = stem.trim().toLowerCase()
  if (!s) return []
  // Asked for more than are kept: the search returns fuzzy neighbours too
  // ("contact" for "contract"), and those are dropped below.
  const rows = await searchEntries(supabase, lang, stem, limit * 3)
  const seen = new Set<string>([headword.toLowerCase()])
  const kin: DictEntryPreview[] = []
  for (const r of rows) {
    const h = r.headword.toLowerCase()
    if (seen.has(h) || !h.startsWith(s)) continue
    seen.add(h)
    kin.push(r)
    if (kin.length >= limit) break
  }
  return kin
}
