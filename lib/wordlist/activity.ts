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
  const today = localDay(now)
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
    .upsert({ day: localDay(now) }, { onConflict: 'user_id,day', ignoreDuplicates: true })
  if (error) throw error
}

const activityRow = z.object({ day: z.string() })

/** Distinct activity days for the current user. RLS scopes the read. */
export async function getActivityDays(supabase: SupabaseClient): Promise<string[]> {
  const rows = await fetchAllRows((from, to) =>
    supabase.from('review_log').select('day').order('day').range(from, to))
  return activityRow.array().parse(rows).map((r) => r.day)
}
