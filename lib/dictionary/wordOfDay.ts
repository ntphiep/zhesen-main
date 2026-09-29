import type { SupabaseClient } from '@supabase/supabase-js'
import { localDay } from '@/lib/wordlist/activity'
import { PREVIEW_SELECT } from './entrySelect'
import { entryPreviewRow, toPreview } from './rows'
import type { LangCode } from '@/lib/languages'

/** The pool is English-only: the frequency ranks that make the pick meaningful
 * exist for en and nothing else. */
const WORD_OF_DAY_LANG: LangCode = 'en'

export interface DailyWord {
  id: string
  /** Always English today; carried explicitly so a renderer never has to assume. */
  lang: LangCode
  headword: string
  ipa: string | null
  glossVi: string | null
  level: string | null
}

/** Integer index of a timestamp's local calendar day (days since the epoch). */
export function dayNumber(now: number): number {
  const [y, m, d] = localDay(now).split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000)
}

/** Deterministic pick for a given day index, rotating through the pool. */
export function pickByDay<T>(pool: T[], dayNum: number): T | null {
  if (pool.length === 0) return null
  return pool[((dayNum % pool.length) + pool.length) % pool.length]
}

/** A common English word chosen deterministically for the given day index. Picks
 * from the 200 most frequent words so the daily word is always learner-relevant. */
export async function getWordOfDay(supabase: SupabaseClient, dayNum: number): Promise<DailyWord | null> {
  const { data, error } = await supabase
    .schema('lex')
    .from('entries')
    .select(PREVIEW_SELECT)
    .eq('lang', WORD_OF_DAY_LANG)
    .not('frequency_rank', 'is', null)
    .lte('frequency_rank', 2000)
    .order('frequency_rank', { ascending: true })
    .limit(200)
  if (error) throw error
  const row = pickByDay(entryPreviewRow.array().parse(data ?? []), dayNum)
  if (!row) return null
  const p = toPreview(row)
  return {
    id: p.id,
    lang: WORD_OF_DAY_LANG,
    headword: p.headword,
    ipa: p.ipa,
    glossVi: p.glossVi ?? p.glossEn,
    level: p.level,
  }
}
