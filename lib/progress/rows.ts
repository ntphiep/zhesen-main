import { z } from 'zod'
import type { CardRecord, LessonProgress, LessonStatus } from './types'
import type { LangCode } from '@/lib/content/types'

const ms = (iso: string | null) => (iso ? Date.parse(iso) : null)
const iso = (n: number) => new Date(n).toISOString()

const srsRow = z.object({
  user_id: z.string(), vocab_id: z.string(), lang: z.enum(['zh', 'es', 'en']),
  interval_days: z.number().int(), ease: z.number(), reps: z.number().int(), lapses: z.number().int(),
  due_at: z.string(), last_reviewed_at: z.string().nullable(),
})

export function cardFromRow(r: unknown): CardRecord {
  const x = srsRow.parse(r)
  return {
    vocabId: x.vocab_id, lang: x.lang,
    intervalDays: x.interval_days, ease: x.ease, reps: x.reps, lapses: x.lapses,
    dueAt: Date.parse(x.due_at), lastReviewedAt: ms(x.last_reviewed_at),
  }
}

export function cardToRow(userId: string, c: CardRecord) {
  return {
    user_id: userId, vocab_id: c.vocabId, lang: c.lang,
    interval_days: c.intervalDays, ease: c.ease, reps: c.reps, lapses: c.lapses,
    due_at: iso(c.dueAt), last_reviewed_at: c.lastReviewedAt ? iso(c.lastReviewedAt) : null,
  }
}

const lpRow = z.object({
  lesson_id: z.string(),
  status: z.enum(['not_started', 'in_progress', 'completed']),
  completed_at: z.string().nullable(),
})

export function lessonProgressFromRow(r: unknown): LessonProgress {
  const x = lpRow.parse(r)
  return { lessonId: x.lesson_id, status: x.status, completedAt: ms(x.completed_at) }
}
