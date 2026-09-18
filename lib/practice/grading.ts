import type { Grade } from '@/lib/progress/types'

/**
 * Turn a practice answer into an FSRS grade. Every practice mode must route through here,
 * or it writes nothing to the schedule and the queue never moves. A correct answer is
 * `good` in any mode; a near miss exists only where the learner produced the word, so only
 * the typed modes can report one.
 */
export interface PracticeOutcome {
  /** Whether the answer was accepted at all. */
  correct: boolean
  /** The learner produced the word but not exactly: a one-character typo, or a
   *  match found only after a wrong pairing. Meaningless for multiple choice. */
  nearly?: boolean
}

export function gradeFromOutcome({ correct, nearly = false }: PracticeOutcome): Grade {
  if (!correct) return 'again'
  return nearly ? 'hard' : 'good'
}

/** Whether a mode's failures are trustworthy enough to count as forgetting. Speech
 *  recognition fails on a noisy room or an unheard accent, and `again` would reset
 *  stability over a hardware problem, so `speak` reports successes only. */
export const REPORTS_FAILURES: Record<PracticeMode, boolean> = {
  quiz: true,
  write: true,
  dictation: true,
  match: true,
  speak: false,
}

export type PracticeMode = 'quiz' | 'write' | 'dictation' | 'match' | 'speak'

/** The grade a mode should record, or null when it should record nothing. */
export function gradeForMode(mode: PracticeMode, outcome: PracticeOutcome): Grade | null {
  if (!outcome.correct && !REPORTS_FAILURES[mode]) return null
  return gradeFromOutcome(outcome)
}
