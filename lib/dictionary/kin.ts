import type { SupabaseClient } from '@supabase/supabase-js'
import { searchEntries } from './search'
import type { DictEntryPreview } from './types'
import type { LangCode } from '@/lib/languages'

/**
 * The words built on the same stem: adjourn to adjourned, adjourning, adjournment.
 * `lex.lex_relations` holds no row at all for `en:adjourned`, so this asks `lex.search`
 * with the stem and keeps only the prefix matches, which is what a derived word is. The
 * caller must exclude Chinese: a Chinese prefix is a compound, `getEntriesContaining`.
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
