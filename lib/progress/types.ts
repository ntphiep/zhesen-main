import type { LangCode } from '@/lib/content/types'

export type Grade = 'again' | 'hard' | 'good' | 'easy'

export interface SrsState {
  vocabId: string
  intervalDays: number
  ease: number
  reps: number
  lapses: number
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
