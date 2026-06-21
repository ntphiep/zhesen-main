import type { SupabaseClient } from '@supabase/supabase-js'
import { computeStreak, getActivityDays } from './activity'

export interface StatRow {
  srsIntervalDays: number
  srsDueAt: string
  srsLastReviewedAt: string | null
}

export interface WordlistStats {
  total: number
  due: number
  /** "Đã thuộc": interval has grown to Anki's mature threshold (>= 21 days). */
  learned: number
  reviewedToday: number
  /** Consecutive days of activity, counting back from today. */
  streak: number
}

const MATURE_DAYS = 21

function sameLocalDay(a: number, b: number): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
}

export function computeWordlistStats(rows: StatRow[], activityDays: string[], now: number): WordlistStats {
  let due = 0
  let learned = 0
  let reviewedToday = 0
  for (const r of rows) {
    if (Date.parse(r.srsDueAt) <= now) due++
    if (r.srsIntervalDays >= MATURE_DAYS) learned++
    if (r.srsLastReviewedAt && sameLocalDay(Date.parse(r.srsLastReviewedAt), now)) reviewedToday++
  }
  return { total: rows.length, due, learned, reviewedToday, streak: computeStreak(activityDays, now) }
}

interface StatRowDb { srs_interval_days: number; srs_due_at: string; srs_last_reviewed_at: string | null }

/** Wordlist progress stats for the current user. RLS scopes the reads. */
export async function getWordlistStats(supabase: SupabaseClient, now: number): Promise<WordlistStats> {
  const [words, activityDays] = await Promise.all([
    supabase.from('user_words').select('srs_interval_days, srs_due_at, srs_last_reviewed_at'),
    getActivityDays(supabase),
  ])
  if (words.error) throw words.error
  const rows: StatRow[] = ((words.data ?? []) as unknown as StatRowDb[]).map((r) => ({
    srsIntervalDays: r.srs_interval_days,
    srsDueAt: r.srs_due_at,
    srsLastReviewedAt: r.srs_last_reviewed_at,
  }))
  return computeWordlistStats(rows, activityDays, now)
}
