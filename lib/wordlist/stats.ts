import { z } from 'zod'
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

// `StatRow` above is a plain "interval / due / last-reviewed" abstraction, not a
// literal DB shape, so it survives the SM-2 -> FSRS-6 switch unchanged: FSRS's
// `scheduled_days` fills the same "days until due" role SM-2's own interval did.
const statRowDbSchema = z.object({
  fsrs_scheduled_days: z.number(),
  fsrs_due_at: z.string(),
  fsrs_last_review_at: z.string().nullable(),
})

/** Wordlist progress stats for the current user. RLS scopes the reads. */
export async function getWordlistStats(supabase: SupabaseClient, now: number = Date.now()): Promise<WordlistStats> {
  const [words, activityDays] = await Promise.all([
    supabase.from('user_words').select('fsrs_scheduled_days, fsrs_due_at, fsrs_last_review_at'),
    getActivityDays(supabase),
  ])
  if (words.error) throw words.error
  const rows: StatRow[] = z.array(statRowDbSchema).parse(words.data ?? []).map((r) => ({
    srsIntervalDays: r.fsrs_scheduled_days,
    srsDueAt: r.fsrs_due_at,
    srsLastReviewedAt: r.fsrs_last_review_at,
  }))
  return computeWordlistStats(rows, activityDays, now)
}
