'use client'
import { useCallback, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { gradeWordById } from '@/lib/wordlist/review'
import { logActivityDay } from '@/lib/wordlist/activity'
import type { Grade } from '@/lib/progress/types'
import type { PracticeMode } from '@/lib/practice/grading'

/**
 * Write a practice answer into the mode's skill and its log, and remember if either failed.
 *
 * The write stays unawaited so a slow round trip does not hold up the next
 * question. `failed` is sticky for the session: one lost write makes the
 * session's progress untrustworthy, and clearing the warning on the next
 * success would hide exactly that.
 */
export function useGradeSync(supabase: SupabaseClient) {
  const [failed, setFailed] = useState(false)

  const record = useCallback((wordId: string, mode: PracticeMode, grade: Grade | null) => {
    if (!grade) return
    void gradeWordById(supabase, wordId, mode, grade)
      .then((r) => { if (r && !r.logged) setFailed(true) })
      .catch(() => setFailed(true))
  }, [supabase])

  /**
   * Mark today as practised, for the streak.
   *
   * `computeStreak` counts consecutive days, so one unrecorded day resets the
   * streak to zero with no way to put it back from the interface. It reports
   * through the same `failed` flag as `record`.
   */
  const logDay = useCallback(() => {
    void logActivityDay(supabase).catch(() => setFailed(true))
  }, [supabase])

  return { record, logDay, failed }
}
