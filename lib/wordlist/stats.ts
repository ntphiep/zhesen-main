import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LangCode } from '@/lib/languages'
import { computeStreak, getActivityDays } from './activity'
import type { WordStatus } from './types'

export interface StatRow {
  lang: LangCode
  status: WordStatus
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
  /** Word count per learning status. */
  byStatus: Record<WordStatus, number>
  /** Word count per target language. */
  byLang: Record<LangCode, number>
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
  const byStatus: Record<WordStatus, number> = { new: 0, learning: 0, known: 0 }
  const byLang: Record<LangCode, number> = { en: 0, es: 0, zh: 0 }
  for (const r of rows) {
    if (Date.parse(r.srsDueAt) <= now) due++
    if (r.srsIntervalDays >= MATURE_DAYS) learned++
    if (r.srsLastReviewedAt && sameLocalDay(Date.parse(r.srsLastReviewedAt), now)) reviewedToday++
    byStatus[r.status]++
    byLang[r.lang]++
  }
  return { total: rows.length, due, learned, reviewedToday, streak: computeStreak(activityDays, now), byStatus, byLang }
}

// `StatRow` above is a plain "interval / due / last-reviewed" abstraction, not a
// literal DB shape, so it survives the SM-2 -> FSRS-6 switch unchanged: FSRS's
// `scheduled_days` fills the same "days until due" role SM-2's own interval did.
const statRowDbSchema = z.object({
  lang: z.enum(['zh', 'es', 'en']),
  status: z.enum(['new', 'learning', 'known']),
  fsrs_scheduled_days: z.number(),
  fsrs_due_at: z.string(),
  fsrs_last_review_at: z.string().nullable(),
})

/** Wordlist progress stats for the current user. RLS scopes the reads. */
export async function getWordlistStats(supabase: SupabaseClient, now: number = Date.now()): Promise<WordlistStats> {
  const [words, activityDays] = await Promise.all([
    supabase.from('user_words').select('lang, status, fsrs_scheduled_days, fsrs_due_at, fsrs_last_review_at'),
    getActivityDays(supabase),
  ])
  if (words.error) throw words.error
  const rows: StatRow[] = z.array(statRowDbSchema).parse(words.data ?? []).map((r) => ({
    lang: r.lang,
    status: r.status,
    srsIntervalDays: r.fsrs_scheduled_days,
    srsDueAt: r.fsrs_due_at,
    srsLastReviewedAt: r.fsrs_last_review_at,
  }))
  return computeWordlistStats(rows, activityDays, now)
}
