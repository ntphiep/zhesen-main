import { z } from '@/lib/zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LangCode } from '@/lib/languages'
import { computeStreak, getActivityDays, getTodayEvents, streakState, studyDay, studyDayEnd, type Streak, type TodayEvents } from './activity'
import { SESSION_LIMITS } from './review'
import type { NotebookState, WordStatus } from './types'
import type { Skill } from '@/lib/practice/grading'
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
  /** The recognition skill's interval and reps (0160). Absent where a caller builds a row by hand. */
  recogIntervalDays?: number
  recogReps?: number
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
  /** Freezes held and whether one saved yesterday. Set by `getWordlistStats`, not by `computeWordlistStats`. */
  streakDetail?: Streak
  /** Word count per learning status. */
  byStatus: Record<WordStatus, number>
  /** Word count per target language. */
  byLang: Record<LangCode, number>
  /** Each skill's split into learned, learning and unseen. Set by `getWordlistStats`. */
  skills?: Record<Skill, LangProgress>
}

const MATURE_DAYS = 21

// Same study day as the streak: this is read on the server and the timestamps it
// compares were written in the reader's browser.
function sameStudyDay(a: number, b: number): boolean {
  return studyDay(a) === studyDay(b)
}

/** `today` comes from the answer log; without it the new-card allowance is per session and
 *  "reviewed today" counts recall grades only. */
export function computeWordlistStats(rows: StatRow[], activityDays: string[], now: number, today?: TodayEvents): WordlistStats {
  let due = 0
  let learned = 0
  let reviewedToday = 0
  const byStatus: Record<WordStatus, number> = { new: 0, learning: 0, known: 0 }
  const byLang: Record<LangCode, number> = { en: 0, es: 0, zh: 0 }
  let dueNew = 0
  const dueBy = studyDayEnd(now)
  for (const r of rows) {
    if (r.status !== 'known' && Date.parse(r.srsDueAt) <= dueBy) {
      if (r.srsReps > 0) due++
      else dueNew++
    }
    if (r.srsIntervalDays >= MATURE_DAYS) learned++
    if (r.srsLastReviewedAt && sameStudyDay(Date.parse(r.srsLastReviewedAt), now)) reviewedToday++
    byStatus[r.status]++
    byLang[r.lang]++
  }
  // Same arithmetic as `listDueCards`, so "Cần ôn" is a promise the review
  // session keeps. A flat count of overdue rows is dominated by never-seen
  // cards, which are all due the instant they are saved.
  const learnedDue = Math.min(due, SESSION_LIMITS.limit)
  const room = Math.max(0, Math.min(SESSION_LIMITS.newLimit - (today?.newToday ?? 0), SESSION_LIMITS.limit - learnedDue))
  const sessionDue = learnedDue + Math.min(room, dueNew)
  return {
    total: rows.length, due: sessionDue, learned, reviewedToday: today?.reviewedToday ?? reviewedToday,
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
  fsrs_recog_scheduled_days: z.number(),
  fsrs_recog_reps: z.number(),
})

/** Every saved word's scheduling columns, one row each. RLS scopes the read. */
export async function fetchStatRows(supabase: SupabaseClient): Promise<StatRow[]> {
  const wordRows = await fetchAllRows((from, to) =>
    supabase.from('user_words')
      .select('lang, status, fsrs_scheduled_days, fsrs_due_at, fsrs_last_review_at, fsrs_reps, fsrs_recog_scheduled_days, fsrs_recog_reps')
      .order('id')
      .range(from, to))
  return z.array(statRowDbSchema).parse(wordRows).map((r) => ({
    lang: r.lang,
    status: r.status,
    srsIntervalDays: r.fsrs_scheduled_days,
    srsDueAt: r.fsrs_due_at,
    srsLastReviewedAt: r.fsrs_last_review_at,
    srsReps: r.fsrs_reps,
    recogIntervalDays: r.fsrs_recog_scheduled_days,
    recogReps: r.fsrs_recog_reps,
  }))
}

/** Wordlist progress stats for the current user. RLS scopes the reads. */
export async function getWordlistStats(supabase: SupabaseClient, now: number = Date.now()): Promise<WordlistStats> {
  const [rows, activityDays, today] = await Promise.all([
    fetchStatRows(supabase), getActivityDays(supabase), getTodayEvents(supabase, now),
  ])
  return {
    ...computeWordlistStats(rows, activityDays, now, today),
    streakDetail: streakState(activityDays, now),
    skills: computeSkillProgress(rows),
  }
}

/** One language's share of the notebook. The three parts add up to `total`: learned is
 *  the mature interval `computeWordlistStats` counts, unseen is never graded. */
export interface LangProgress {
  total: number
  learned: number
  learning: number
  unseen: number
}

export function progressPart(reps: number, intervalDays: number): Exclude<keyof LangProgress, 'total'> {
  if (intervalDays >= MATURE_DAYS) return 'learned'
  return reps > 0 ? 'learning' : 'unseen'
}

const notebookRow = z.object({
  entry_id: z.string(),
  status: z.enum(['new', 'learning', 'known']),
  fsrs_reps: z.number(),
  fsrs_scheduled_days: z.number(),
})

/** The saved ones among `entryIds`, in one query that RLS scopes to the reader. Known is
 *  the learner's own mark or the mature interval the progress bar counts as learned. */
export async function readNotebookStates(supabase: SupabaseClient, entryIds: string[]): Promise<Map<string, NotebookState>> {
  if (entryIds.length === 0) return new Map()
  const { data, error } = await supabase.from('user_words')
    .select('entry_id, status, fsrs_reps, fsrs_scheduled_days')
    .in('entry_id', entryIds)
  if (error) throw error
  return new Map(notebookRow.array().parse(data).map((r): [string, NotebookState] => [
    r.entry_id,
    r.status === 'known' || progressPart(r.fsrs_reps, r.fsrs_scheduled_days) === 'learned' ? 'known' : 'saved',
  ]))
}

export function computeLangProgress(rows: StatRow[]): Record<LangCode, LangProgress> {
  const out: Record<LangCode, LangProgress> = {
    en: { total: 0, learned: 0, learning: 0, unseen: 0 },
    es: { total: 0, learned: 0, learning: 0, unseen: 0 },
    zh: { total: 0, learned: 0, learning: 0, unseen: 0 },
  }
  for (const r of rows) {
    const p = out[r.lang]
    p.total++
    p[progressPart(r.srsReps, r.srsIntervalDays)]++
  }
  return out
}

/** The notebook split per skill: recall from the fsrs_* columns, recognition from fsrs_recog_*. */
export function computeSkillProgress(rows: StatRow[]): Record<Skill, LangProgress> {
  const empty = (): LangProgress => ({ total: 0, learned: 0, learning: 0, unseen: 0 })
  const out: Record<Skill, LangProgress> = { recall: empty(), recognition: empty() }
  for (const r of rows) {
    out.recall.total++
    out.recall[progressPart(r.srsReps, r.srsIntervalDays)]++
    out.recognition.total++
    out.recognition[progressPart(r.recogReps ?? 0, r.recogIntervalDays ?? 0)]++
  }
  return out
}
