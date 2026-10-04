import type { SupabaseClient } from '@supabase/supabase-js'
import type { LangCode } from '@/lib/languages'
import { containingRow, entryPreviewRow, toContaining, toPreview } from './rows'
import { PREVIEW_SELECT } from './entrySelect'
import { PHRASAL_PARTICLES } from './phrases'
import { phaveRank } from './phave'
import type { ContainingWord, DictEntryPreview } from './types'

/** Longer entries containing this word: 学 leads to 学生 and 大学, "give" to "give up".
 *  `lex.lex_relations` cannot answer this -- roughly 96% of its rows are the `derived`
 *  catch-all, classified by the shape of a string (see ./relations). */
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

/** Every entry `lex.entries_containing` can return for a verb: get heads 607 entries, and
 *  its phrasal verbs sit among idioms such as "get a life". The filter below runs inside
 *  the same statement, so the cap costs little: measured on production, get answered its
 *  48 phrasal verbs in 194 ms and go its 41 in 645 ms. */
const CONTAINING_POOL = 2000

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The phrasal and prepositional verbs of an English verb (give up, look forward to, put
 *  up with), the PHaVE List's first in its order and the rest as `lex.entries_containing`
 *  ranks them, with the lead meaning the word page shows for each. That RPC's own gloss is
 *  sense 1's, which for give up is "đầu hàng" and for get over is empty. Its order put get
 *  at and get by ahead of get out and get back. */
export async function getPhrasalVerbs(
  supabase: SupabaseClient, verb: string, limit = 24,
): Promise<DictEntryPreview[]> {
  const v = verb.trim()
  if (!v || /\s/.test(v)) return []
  const pattern = `^${escapeRegex(v)}( (${PHRASAL_PARTICLES.join('|')})){1,2}$`
  const { data, error } = await supabase
    .schema('lex')
    .rpc('entries_containing', { p_lang: 'en', p_text: v, p_limit: CONTAINING_POOL })
    .filter('headword', 'imatch', pattern)
    .limit(limit)
  if (error) throw error
  const order = containingRow.array().parse(data ?? [])
    .map((r, i) => ({ id: r.id, rank: phaveRank(r.headword), i }))
    .sort((a, b) => (a.rank - b.rank) || (a.i - b.i))
    .map((r) => r.id)
  if (order.length === 0) return []
  const rows = await supabase.schema('lex').from('entries').select(PREVIEW_SELECT).in('id', order)
  if (rows.error) throw rows.error
  const byId = new Map(entryPreviewRow.array().parse(rows.data ?? []).map((r) => [r.id, toPreview(r)]))
  return order.map((id) => byId.get(id)).filter((p): p is DictEntryPreview => Boolean(p))
}
