import type { CardRecord, Grade, LessonProgress, LessonStatus } from './types'
import type { LangCode } from '@/lib/content/types'

export interface ProgressStore {
  ensureCards(cards: { vocabId: string; lang: LangCode }[], now: number): Promise<void>
  getDueCards(lang: LangCode, now: number, limit?: number): Promise<CardRecord[]>
  countDue(lang: LangCode, now: number): Promise<number>
  recordReview(vocabId: string, grade: Grade, now: number): Promise<CardRecord>
  getLessonProgress(lessonId: string): Promise<LessonProgress | null>
  setLessonProgress(lessonId: string, status: LessonStatus, now: number): Promise<void>
}
