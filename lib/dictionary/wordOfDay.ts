import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { localDay } from '@/lib/wordlist/activity'

export interface DailyWord {
  id: string
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

const poolRow = z.object({
  id: z.string(),
  headword: z.string(),
  level: z.string().nullable(),
  senses: z.array(z.object({
    gloss_vi: z.string().nullable(), gloss_en: z.string().nullable(), sense_order: z.number(),
  })).nullable(),
  pronunciations: z.array(z.object({ accent: z.string(), ipa: z.string().nullable() })).nullable(),
})

/** A common English word chosen deterministically for the given day index. Picks
 * from the 200 most frequent words so the daily word is always learner-relevant. */
export async function getWordOfDay(supabase: SupabaseClient, dayNum: number): Promise<DailyWord | null> {
  const { data, error } = await supabase
    .schema('lex')
    .from('entries')
    .select('id, headword, level, senses(gloss_vi, gloss_en, sense_order), pronunciations(accent, ipa)')
    .eq('lang', 'en')
    .not('frequency_rank', 'is', null)
    .lte('frequency_rank', 2000)
    .order('frequency_rank', { ascending: true })
    .limit(200)
  if (error) throw error
  const row = pickByDay(poolRow.array().parse(data ?? []), dayNum)
  if (!row) return null
  const primary = [...(row.senses ?? [])].sort((a, b) => a.sense_order - b.sense_order)[0]
  const prons = row.pronunciations ?? []
  const ipa = prons.find((p) => p.accent.toLowerCase().includes('us') && p.ipa)?.ipa ?? prons.find((p) => p.ipa)?.ipa ?? null
  return {
    id: row.id,
    headword: row.headword,
    ipa,
    glossVi: primary?.gloss_vi ?? primary?.gloss_en ?? null,
    level: row.level,
  }
}
