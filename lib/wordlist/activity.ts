import type { SupabaseClient } from '@supabase/supabase-js'

const DAY = 86_400_000

/** Local calendar day of a timestamp as 'YYYY-MM-DD'. */
export function localDay(ts: number): string {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
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
  const { error } = await supabase
    .from('review_log')
    .upsert({ day: localDay(now) }, { onConflict: 'user_id,day', ignoreDuplicates: true })
  if (error) throw error
}

/** Distinct activity days for the current user. RLS scopes the read. */
export async function getActivityDays(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.from('review_log').select('day')
  if (error) throw error
  return ((data ?? []) as { day: string }[]).map((r) => r.day)
}
