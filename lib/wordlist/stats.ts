import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LangCode } from '@/lib/languages'
import { computeStreak, getActivityDays } from './activity'
import { SESSION_LIMITS } from './review'
import type { WordStatus } from './types'
import { localDay } from '@/lib/wordlist/activity'
import { fetchAllRows } from '@/lib/supabase/paginate'

export interface StatRow {
  lang: LangCode
  status: WordStatus
  srsIntervalDays: number
  srsDueAt: string
  srsLastReviewedAt: string | null
  /** How many times the card has been graded. Zero means never seen, which is
   *  what separates the review obligation from the new-card allowance. */
  srsReps: number
}

export interface WordlistStats {
  total: number
  /** What the next session will hand over, not how many rows are past their due
   *  date. See `countDueCards` for why those are very different numbers. */
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

// Same fixed study timezone as the streak: this is read on the server and the
// timestamps it compares were written in the reader's browser.
function sameLocalDay(a: number, b: number): boolean {
  return localDay(a) === localDay(b)
}

export function computeWordlistStats(rows: StatRow[], activityDays: string[], now: number): WordlistStats {
  let due = 0
  let learned = 0
  let reviewedToday = 0
  const byStatus: Record<WordStatus, number> = { new: 0, learning: 0, known: 0 }
  const byLang: Record<LangCode, number> = { en: 0, es: 0, zh: 0 }
  let dueNew = 0
  for (const r of rows) {
    if (Date.parse(r.srsDueAt) <= now) {
      if (r.srsReps > 0) due++
      else dueNew++
    }
    if (r.srsIntervalDays >= MATURE_DAYS) learned++
    if (r.srsLastReviewedAt && sameLocalDay(Date.parse(r.srsLastReviewedAt), now)) reviewedToday++
    byStatus[r.status]++
    byLang[r.lang]++
  }
  // Same arithmetic as `listDueCards`, so "Cần ôn" is a promise the review
  // session keeps. A flat count of overdue rows is dominated by never-seen
  // cards, which are all due the instant they are saved.
  const learnedDue = Math.min(due, SESSION_LIMITS.limit)
  const room = Math.max(0, Math.min(SESSION_LIMITS.newLimit, SESSION_LIMITS.limit - learnedDue))
  const sessionDue = learnedDue + Math.min(room, dueNew)
  return {
    total: rows.length, due: sessionDue, learned, reviewedToday,
    streak: computeStreak(activityDays, now), byStatus, byLang,
  }
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
  fsrs_reps: z.number(),
})

/** Wordlist progress stats for the current user. RLS scopes the reads. */
export async function getWordlistStats(supabase: SupabaseClient, now: number = Date.now()): Promise<WordlistStats> {
  const [wordRows, activityDays] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase.from('user_words')
        .select('lang, status, fsrs_scheduled_days, fsrs_due_at, fsrs_last_review_at, fsrs_reps')
        .range(from, to)),
    getActivityDays(supabase),
  ])
  const rows: StatRow[] = z.array(statRowDbSchema).parse(wordRows).map((r) => ({
    lang: r.lang,
    status: r.status,
    srsIntervalDays: r.fsrs_scheduled_days,
    srsDueAt: r.fsrs_due_at,
    srsLastReviewedAt: r.fsrs_last_review_at,
    srsReps: r.fsrs_reps,
  }))
  return computeWordlistStats(rows, activityDays, now)
}
