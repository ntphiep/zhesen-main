import type { SupabaseClient } from '@supabase/supabase-js'
import { ensureSession } from '@/lib/supabase/session'
import { fetchAllRows } from '@/lib/supabase/paginate'
import { z } from '@/lib/zod'

const DAY = 86_400_000

/** The timezone the study day is measured in. Must be fixed, not the process's own: a
 *  streak day is written in the reader's browser and read back on a server, and with
 *  `getFullYear` a 06:00 practice in Vietnam read as the previous day on a UTC server. */
export const STUDY_TIMEZONE = 'Asia/Ho_Chi_Minh'

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: STUDY_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Calendar day of a timestamp in the study timezone, as 'YYYY-MM-DD'. */
export function localDay(ts: number): string {
  // en-CA formats as YYYY-MM-DD, which is the shape review_log.day stores.
  return dayFormatter.format(new Date(ts))
}

/** The study day starts at 04:00 in the study timezone, as Anki's "next day starts at": a
 *  session past midnight still counts for the evening it continues. */
export const STUDY_ROLLOVER_HOUR = 4
/** Vietnam keeps UTC+7 all year, so 04:00 there is 21:00 UTC and +3 h puts each study day on
 *  one UTC date, which is how ts-fsrs counts elapsed days. */
export const STUDY_DAY_SHIFT_MS = (7 - STUDY_ROLLOVER_HOUR) * 3_600_000

/** The study day of a timestamp, as 'YYYY-MM-DD'. */
export function studyDay(ts: number): string {
  return new Date(ts + STUDY_DAY_SHIFT_MS).toISOString().slice(0, 10)
}

/** When the study day holding `ts` began. */
export function studyDayStart(ts: number): number {
  return Math.floor((ts + STUDY_DAY_SHIFT_MS) / DAY) * DAY - STUDY_DAY_SHIFT_MS
}

/** The last millisecond of the study day holding `ts`: the due cutoff for that day. */
export function studyDayEnd(ts: number): number {
  return studyDayStart(ts) + DAY - 1
}

/** Consecutive studied days that earn one streak freeze. */
export const FREEZE_EVERY = 7
/** Most freezes held at once. */
export const MAX_FREEZES = 2

export interface Streak {
  /** Studied days in the current run. A day a freeze covered keeps the run but adds nothing. */
  days: number
  /** Freezes held now, 0 to `MAX_FREEZES`. */
  freezes: number
  /** Yesterday was missed and a freeze kept the run. */
  savedYesterday: boolean
}

/** The current streak, replayed from the first activity day. Derived, never stored: a single
 *  missed day spends a held freeze, a second missed day in a row breaks the run and drops
 *  the freezes with it, and today stays open until it is over. */
export function streakState(days: string[], now: number): Streak {
  const today = studyDay(now)
  // 'YYYY-MM-DD' sorts as dates, and stepping UTC midnights walks calendar days exactly.
  const set = new Set(days.filter((day) => day <= today))
  const out: Streak = { days: 0, freezes: 0, savedYesterday: false }
  if (!set.size) return out
  const last = Date.parse(`${today}T00:00:00Z`)
  let row = 0
  let frozen = false
  for (let t = Date.parse(`${[...set].sort()[0]}T00:00:00Z`); t < last + DAY; t += DAY) {
    if (set.has(new Date(t).toISOString().slice(0, 10))) {
      out.days++
      row++
      frozen = false
      if (row % FREEZE_EVERY === 0) out.freezes = Math.min(MAX_FREEZES, out.freezes + 1)
    } else if (t === last) {
      break
    } else if (out.freezes > 0 && !frozen) {
      out.freezes--
      row = 0
      frozen = true
      out.savedYesterday = t === last - DAY
    } else {
      out.days = 0
      out.freezes = 0
      row = 0
      frozen = false
    }
  }
  return out
}

/** Current study streak in days, with freezes covering single missed days. */
export function computeStreak(days: string[], now: number): number {
  return streakState(days, now).days
}

/** Record that the user practised today (idempotent per day). RLS sets user_id. */
export async function logActivityDay(supabase: SupabaseClient, now: number = Date.now()): Promise<void> {
  await ensureSession(supabase)
  const { error } = await supabase
    .from('review_log')
    .upsert({ day: studyDay(now) }, { onConflict: 'user_id,day', ignoreDuplicates: true })
  if (error) throw error
}

const eventRow = z.object({
  word_id: z.string(),
  skill: z.enum(['recall', 'recognition']),
  state_before: z.number(),
  applied: z.boolean(),
})

/** What the answer log says about the current study day. */
export interface TodayEvents {
  /** Words first graded for recall today: what the daily new-card allowance has spent. */
  newToday: number
  /** Distinct words answered today in any mode, applied or only logged. */
  reviewedToday: number
}

/** Today's answers, read once. RLS scopes the read. */
export async function getTodayEvents(supabase: SupabaseClient, now: number = Date.now()): Promise<TodayEvents> {
  const since = new Date(studyDayStart(now)).toISOString()
  const rows = eventRow.array().parse(await fetchAllRows((from, to) =>
    supabase.from('review_events').select('word_id, skill, state_before, applied')
      .gte('reviewed_at', since).order('id').range(from, to)))
  const fresh = rows.filter((r) => r.skill === 'recall' && r.state_before === 0 && r.applied)
  return { newToday: new Set(fresh.map((r) => r.word_id)).size, reviewedToday: new Set(rows.map((r) => r.word_id)).size }
}

/** How many words were first graded for recall today, as one head-only COUNT. A New card
 *  always applies and leaves state 0, so each such row is a distinct word. */
export async function countNewToday(supabase: SupabaseClient, now: number = Date.now()): Promise<number> {
  const { count, error } = await supabase.from('review_events')
    .select('id', { count: 'exact', head: true })
    .eq('skill', 'recall').eq('state_before', 0).eq('applied', true)
    .gte('reviewed_at', new Date(studyDayStart(now)).toISOString())
  if (error) throw error
  return count ?? 0
}

const activityRow = z.object({ day: z.string() })

/** Distinct activity days for the current user. RLS scopes the read. */
export async function getActivityDays(supabase: SupabaseClient): Promise<string[]> {
  const rows = await fetchAllRows((from, to) =>
    supabase.from('review_log').select('day').order('day').range(from, to))
  return activityRow.array().parse(rows).map((r) => r.day)
}
