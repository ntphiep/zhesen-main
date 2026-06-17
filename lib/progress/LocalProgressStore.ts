import type { ProgressStore } from './ProgressStore'
import type { CardRecord, Grade, LessonProgress, LessonStatus } from './types'
import type { LangCode } from '@/lib/content/types'
import type { KVBackend } from './kv'
import { initialSrsState, review } from './srs'

const CARDS_KEY = 'chesen.cards.v1'
const LESSONS_KEY = 'chesen.lessons.v1'

export class LocalProgressStore implements ProgressStore {
  constructor(private kv: KVBackend) {}

  private readCards(): Record<string, CardRecord> {
    const raw = this.kv.get(CARDS_KEY)
    return raw ? (JSON.parse(raw) as Record<string, CardRecord>) : {}
  }
  private writeCards(cards: Record<string, CardRecord>): void {
    this.kv.set(CARDS_KEY, JSON.stringify(cards))
  }
  private readLessons(): Record<string, LessonProgress> {
    const raw = this.kv.get(LESSONS_KEY)
    return raw ? (JSON.parse(raw) as Record<string, LessonProgress>) : {}
  }
  private writeLessons(l: Record<string, LessonProgress>): void {
    this.kv.set(LESSONS_KEY, JSON.stringify(l))
  }

  async ensureCards(items: { vocabId: string; lang: LangCode }[], now: number): Promise<void> {
    const cards = this.readCards()
    let changed = false
    for (const { vocabId, lang } of items) {
      if (!cards[vocabId]) {
        cards[vocabId] = { ...initialSrsState(vocabId, now), lang }
        changed = true
      }
    }
    if (changed) this.writeCards(cards)
  }

  async getDueCards(lang: LangCode, now: number, limit?: number): Promise<CardRecord[]> {
    const due = Object.values(this.readCards())
      .filter((c) => c.lang === lang && c.dueAt <= now)
      .sort((a, b) => a.dueAt - b.dueAt)
    return typeof limit === 'number' ? due.slice(0, limit) : due
  }

  async countDue(lang: LangCode, now: number): Promise<number> {
    return (await this.getDueCards(lang, now)).length
  }

  async recordReview(vocabId: string, grade: Grade, now: number): Promise<CardRecord> {
    const cards = this.readCards()
    const existing = cards[vocabId]
    if (!existing) throw new Error(`No card for vocab ${vocabId}`)
    const updated: CardRecord = { ...review(existing, grade, now), lang: existing.lang }
    cards[vocabId] = updated
    this.writeCards(cards)
    return updated
  }

  async getLessonProgress(lessonId: string): Promise<LessonProgress | null> {
    return this.readLessons()[lessonId] ?? null
  }

  async setLessonProgress(lessonId: string, status: LessonStatus, now: number): Promise<void> {
    const lessons = this.readLessons()
    lessons[lessonId] = {
      lessonId,
      status,
      completedAt: status === 'completed' ? now : null,
    }
    this.writeLessons(lessons)
  }
}
