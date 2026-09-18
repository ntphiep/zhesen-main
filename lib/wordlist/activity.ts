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

/** Current study streak: consecutive days with activity, counting back from today. Today
 *  being absent does not break it until yesterday is also missed. */
export function computeStreak(days: string[], now: number): number {
  const set = new Set(days)
  let cursor = now
  if (!set.has(localDay(cursor))) {
    cursor -= DAY
    if (!set.has(localDay(cursor))) return 0
  }
  let count = 0
  while (set.has(localDay(cursor))) {
    count++
    cursor -= DAY
  }
  return count
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
