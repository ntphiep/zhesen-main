import type { Grade, SrsState } from '@/lib/progress/types'
import { studyDayEnd } from '@/lib/wordlist/activity'

/**
 * Turn a practice answer into an FSRS grade for the mode's skill. Every practice mode must
 * route through here and then `gradeWordById`, which logs every answer to `review_events`.
 * A correct answer is `good` in any mode; a near miss exists only where the learner produced
 * the word or found it after a wrong pairing.
 */
export interface PracticeOutcome {
  /** Whether the answer was accepted at all. */
  correct: boolean
  /** The learner produced the word but not exactly: a one-character typo, or a
   *  match found only after a wrong pairing. Meaningless for multiple choice. */
  nearly?: boolean
  /** The learner judged the recall effortless. Only a self-graded review can say so. */
  easy?: boolean
}

export function gradeFromOutcome({ correct, nearly = false, easy = false }: PracticeOutcome): Grade {
  if (!correct) return 'again'
  if (easy) return 'easy'
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
  review: true,
}

export type PracticeMode = 'quiz' | 'write' | 'dictation' | 'match' | 'speak' | 'review'

/** The grade a mode should record, or null when it should record nothing. */
export function gradeForMode(mode: PracticeMode, outcome: PracticeOutcome): Grade | null {
  if (!outcome.correct && !REPORTS_FAILURES[mode]) return null
  return gradeFromOutcome(outcome)
}

/** Each saved word has two FSRS states. Picking a meaning or a pair shows the answer among
 *  options, which is recognition; producing the word from its meaning or sound is recall. */
export type Skill = 'recall' | 'recognition'

export const MODE_SKILL: Record<PracticeMode, Skill> = {
  quiz: 'recognition',
  match: 'recognition',
  review: 'recall',
  write: 'recall',
  dictation: 'recall',
  speak: 'recall',
}

/** Whether an answer moves the schedule. A success on a Review card not due by the end of the
 *  study day only gets logged: an early `good` raises stability, and six of them in 14 days
 *  pushed a word to a 46-day interval that two due reviews would have set at 14. */
export function appliesToSchedule(state: SrsState, grade: Grade, now: number): boolean {
  if (grade === 'again' || state.cardState !== 'review') return true
  return state.dueAt <= studyDayEnd(now)
}
