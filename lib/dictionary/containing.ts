import type { SupabaseClient } from '@supabase/supabase-js'
import type { LangCode } from '@/lib/languages'
import { containingRow, toContaining } from './rows'
import type { ContainingWord } from './types'

/**
 * Longer entries that contain this word: 学 leads to 学生 and 大学, "give" to
 * "give up" and "give in".
 *
 * The compounds a word takes part in are most of how Chinese vocabulary grows,
 * and for English they are the phrasal verbs, which a learner meets far more
 * often than the bare verb. Neither was reachable from a word's page.
 * `lex.lex_relations` cannot answer it -- roughly 96% of its rows are the
 * `derived` catch-all, classified by the shape of a string (see ./relations).
 */
export async function getEntriesContaining(
  supabase: SupabaseClient, lang: LangCode, text: string, limit = 12,
): Promise<ContainingWord[]> {
  const q = text.trim()
  if (!q) return []
  const { data, error } = await supabase
    .schema('lex')
    .rpc('entries_containing', { p_lang: lang, p_text: q, p_limit: limit })
  if (error) throw error
  return containingRow.array().parse(data ?? []).map(toContaining)
}
