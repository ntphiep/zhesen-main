import { z } from '@/lib/zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LangCode } from '@/lib/languages'
import type { DictEntryPreview } from './types'
import { entryPreviewRow, toPreview } from './rows'
import { PREVIEW_SELECT } from './entrySelect'

/**
 * "Browse by level" data for `/theory/[lang]/vocabulary`. Grouped counts must go through the
 * `lex.count_entries_by_level` RPC (defined in 0021, last replaced by 0080_entries_form_of.sql): supabase-js
 * has no GROUP BY, and PostgREST's 1000-row cap rules out counting client-side.
 */

export interface LevelSummary {
  level: string
  count: number
  /** True for every Spanish level: the pipeline estimates those, they are not an
   * official CEFR classification. Always false for zh and en today. */
  levelIsEstimated: boolean
}

const levelCountRow = z.object({ level: z.string(), level_is_estimated: z.boolean(), cnt: z.number() })

export async function getLevelsForLanguage(supabase: SupabaseClient, lang: LangCode): Promise<LevelSummary[]> {
  const { data, error } = await supabase.schema('lex').rpc('count_entries_by_level', { p_lang: lang })
  if (error) throw error
  return levelCountRow.array().parse(data ?? []).map((r) => ({ level: r.level, count: r.cnt, levelIsEstimated: r.level_is_estimated }))
}

// Matches the PostgREST max-rows cap on this project (confirmed 1000 by
// requesting a larger range and observing the response still truncate there);
// asking for more than this in one page would be silently truncated anyway.
const PAGE_SIZE_CAP = 1000

export interface LevelPage {
  items: DictEntryPreview[]
  total: number
}

/** One page of entries at a level, ordered by headword for a stable, browsable list.
 *  An inflected form keeps its level on its own page but is left out here, so villages
 *  does not repeat village (`lex.entries.form_of`, migration 0080). */
export async function getEntriesByLevel(
  supabase: SupabaseClient, lang: LangCode, level: string, offset: number, limit = 40,
): Promise<LevelPage> {
  const pageSize = Math.min(limit, PAGE_SIZE_CAP)
  const { data, error, count } = await supabase
    .schema('lex').from('entries').select(PREVIEW_SELECT, { count: 'exact' })
    .eq('lang', lang).eq('level', level).is('form_of', null)
    .order('headword_normalized', { ascending: true }).order('id')
    .range(offset, offset + pageSize - 1)
  if (error) throw error
  return { items: entryPreviewRow.array().parse(data ?? []).map(toPreview), total: count ?? 0 }
}

// PostgREST's own max-rows setting (confirmed 1000) caps any single request
// regardless of the range asked for, so a level with more words than that (e.g.
// en:B1 holds 4,179 lemmas) needs to be paged in chunks to fetch it in full.
const BULK_CHUNK = 1000
const BULK_MAX_ROWS = 20000 // safety bound; no level in this dataset is anywhere near this size

/** Every entry at a level, for "add whole level to wordlist". Pages through in
 * chunks rather than trusting a single unbounded query to return everything. */
export async function getAllEntriesByLevel(supabase: SupabaseClient, lang: LangCode, level: string): Promise<DictEntryPreview[]> {
  const all: DictEntryPreview[] = []
  for (let offset = 0; offset < BULK_MAX_ROWS; offset += BULK_CHUNK) {
    const { items } = await getEntriesByLevel(supabase, lang, level, offset, BULK_CHUNK)
    all.push(...items)
    if (items.length < BULK_CHUNK) break
  }
  return all
}
