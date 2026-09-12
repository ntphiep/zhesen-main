import type { SupabaseClient } from '@supabase/supabase-js'
import { ensureSession } from '@/lib/supabase/session'
import { fetchAllRows } from '@/lib/supabase/paginate'
import { z } from 'zod'

const DAY = 86_400_000

/**
 * The timezone the study day is measured in.
 *
 * A fixed zone rather than the running process's own, because the two ends of a
 * streak run in different places: the day is written by a Client Component in the
 * reader's browser and read back by a Server Component. With `getFullYear` and
 * friends, someone in Vietnam practising at 06:00 wrote "2026-09-12" while a
 * UTC server reading the same row an instant later asked for "2026-09-11", found
 * nothing, and reported a streak of zero — every day between midnight and 07:00.
 *
 * The audience is Vietnamese, so their calendar day is the one that counts.
 */
const STUDY_TIMEZONE = 'Asia/Ho_Chi_Minh'

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

/**
 * Current study streak: consecutive days with activity, counting back from today.
 * Today being absent does not break the streak until yesterday is also missed (so a
 * streak survives until a full day lapses).
 */
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
    supabase.from('review_log').select('day').range(from, to))
  return activityRow.array().parse(rows).map((r) => r.day)
}
