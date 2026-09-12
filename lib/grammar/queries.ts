import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LangCode } from '@/lib/languages'
import { grammarPointRow, grammarPointDetailRow, toGrammarPoint, toGrammarPointDetail, type GrammarPoint, type GrammarPointDetail } from './types'

const grammarPointEntryRow = z.object({ grammar_points: grammarPointRow })

const POINT_SELECT = 'id, lang, level_scheme, level, category_vi, title_vi, pattern, explanation_vi, common_mistake_vi, sort_order'

/** All grammar points for one language, ordered for the `/grammar/[lang]` overview
 * (by level, then the curated sort_order within a level). Small table (currently
 * <50 rows per language) so no pagination. */
export async function listGrammarPointsByLang(supabase: SupabaseClient, lang: LangCode): Promise<GrammarPoint[]> {
  const { data, error } = await supabase
    .schema('lex').from('grammar_points').select(POINT_SELECT)
    .eq('lang', lang).order('level', { ascending: true }).order('sort_order', { ascending: true })
  if (error) throw error
  return grammarPointRow.array().parse(data ?? []).map(toGrammarPoint)
}

/** Number of grammar points per language, for the `/grammar` landing page. */
export async function countGrammarPointsByLang(supabase: SupabaseClient): Promise<Record<LangCode, number>> {
  const { data, error } = await supabase.schema('lex').from('grammar_points').select('lang')
  if (error) throw error
  const counts: Record<LangCode, number> = { en: 0, es: 0, zh: 0 }
  for (const row of grammarPointRow.pick({ lang: true }).array().parse(data ?? [])) counts[row.lang] += 1
  return counts
}

export async function getGrammarPointDetail(supabase: SupabaseClient, id: string): Promise<GrammarPointDetail | null> {
  const { data, error } = await supabase
    .schema('lex').from('grammar_points')
    .select(`${POINT_SELECT}, grammar_examples(text, reading, translation_vi, sort_order)`)
    .eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) return null
  return toGrammarPointDetail(grammarPointDetailRow.parse(data))
}

/** Grammar points that reference a dictionary entry (see `lex.grammar_point_entries`),
 * shown as a "related grammar" link list on the entry detail page. */
export async function getGrammarPointsForEntry(supabase: SupabaseClient, entryId: string): Promise<GrammarPoint[]> {
  const { data, error } = await supabase
    .schema('lex').from('grammar_point_entries')
    .select(`grammar_points!inner(${POINT_SELECT})`)
    .eq('entry_id', entryId)
  if (error) throw error
  return grammarPointEntryRow.array().parse(data ?? [])
    .map((r) => toGrammarPoint(r.grammar_points))
    .sort((a, b) => (a.level ?? '').localeCompare(b.level ?? '') || a.sortOrder - b.sortOrder)
}
