import type { Grade } from '@/lib/progress/types'

/**
 * Turn a practice answer into an FSRS grade.
 *
 * Five of the six practice modes wrote nothing to the schedule: `gradeCard` was
 * called from the flashcard review and nowhere else, so a learner could spend an
 * evening on the quiz, the typing drill and the matching game and come back the
 * next day to exactly the same queue. This is the shared mapping that lets every
 * mode count.
 *
 * The modes differ in how hard they are, and the grade has to reflect that rather
 * than the surface fact of a right answer. Picking the right meaning out of four
 * is recognition; typing the word from its meaning is recall. A correct answer is
 * worth `good` either way, but a near miss only exists where the learner produced
 * the word, so only the typed modes can report `close`.
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

/**
 * Whether a mode's failures are trustworthy enough to count as forgetting.
 *
 * Speech recognition fails for reasons that have nothing to do with the learner:
 * a noisy room, an accent the recogniser was not trained on, a microphone the
 * browser never got permission for. Writing `again` on those would reset a card's
 * stability and add a lapse over a hardware problem, and the learner would have no
 * way to see why their schedule got worse. A missed `good` only delays a card by
 * one interval, so the speaking drill reports its successes and stays quiet about
 * its failures.
 */
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
