'use client'
import { useCallback, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { gradeWordById } from '@/lib/wordlist/review'
import { logActivityDay } from '@/lib/wordlist/activity'
import type { Grade } from '@/lib/progress/types'

/**
 * Write a practice answer into the card's schedule, and remember if it failed.
 *
 * The write stays unawaited: a slow round trip must not hold up the next
 * question. What was wrong was the other half -- `.catch(() => {})` in five
 * places meant a session on a dropped connection, or one that hit Supabase's
 * sign-in limit (see lib/supabase/session.ts), finished with "Kết quả: 9/10 —
 * Tuyệt vời!" and wrote no `fsrs_*` column at all. The next day's queue was
 * untouched and nothing on screen distinguished that from a session that saved.
 *
 * AGENTS.md files this as the project's number-one product bug: a learner
 * practising for an hour and finding tomorrow's queue unchanged. It was fixed
 * once by calling `gradeCard` from every mode; this is the same bug arriving
 * through the error path instead.
 *
 * `failed` is sticky for the session. One lost write is enough to make the
 * session's progress untrustworthy, and clearing the warning on the next
 * success would hide exactly that.
 */
export function useGradeSync(supabase: SupabaseClient) {
  const [failed, setFailed] = useState(false)

  const record = useCallback((wordId: string, grade: Grade | null) => {
    if (!grade) return
    void gradeWordById(supabase, wordId, grade).catch(() => setFailed(true))
  }, [supabase])

  /**
   * Mark today as practised, for the streak.
   *
   * This sat next to the grade as a bare `void logActivityDay(supabase)` -- no
   * catch at all, so a failure was an unhandled rejection rather than a quiet
   * one. It matters more than the wording suggests: `computeStreak` counts
   * consecutive days, so one unrecorded day resets a forty-day streak to zero
   * with no way to put it back from the interface, and the streak is the number
   * a learner watches. It reports through the same flag, so the warning the
   * result screen already renders covers it.
   */
  const logDay = useCallback(() => {
    void logActivityDay(supabase).catch(() => setFailed(true))
  }, [supabase])

  return { record, logDay, failed }
}
