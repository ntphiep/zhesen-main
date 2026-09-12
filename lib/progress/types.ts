import type { LangCode } from '@/lib/languages'

export type Grade = 'again' | 'hard' | 'good' | 'easy'

/** FSRS-6 card states (mirrors ts-fsrs's `State` enum, kept as a string union at
 *  this boundary so the rest of the app never needs to import ts-fsrs). */
export type CardState = 'new' | 'learning' | 'review' | 'relearning'

/** Scheduling state for one card, shaped after ts-fsrs's `Card` model
 *  (stability/difficulty/elapsed_days/scheduled_days/learning_steps/reps/lapses/
 *  state/due/last_review) -- see lib/progress/srs.ts, the only module that talks
 *  to ts-fsrs. */
export interface SrsState {
  vocabId: string
  stability: number
  difficulty: number
  elapsedDays: number
  scheduledDays: number
  learningSteps: number
  reps: number
  lapses: number
  cardState: CardState
  dueAt: number
  lastReviewedAt: number | null
}

export type LessonStatus = 'not_started' | 'in_progress' | 'completed'

export interface LessonProgress {
  lessonId: string
  status: LessonStatus
  completedAt: number | null
}

// stored card couples scheduling state with the language for due filtering
export interface CardRecord extends SrsState {
  lang: LangCode
}
