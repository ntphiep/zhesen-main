import { describe, it, expect } from 'vitest'
import { summarize } from '@/lib/hooks/useHomeData'
import { initialSrsState } from '@/lib/progress/srs'
import type { SrsState } from '@/lib/progress/types'
import type { ReviewCard } from '@/lib/wordlist/review'
import type { LangCode } from '@/lib/languages'

type Loaded = Parameters<typeof summarize>[0]

const DAY = 86_400_000
// 10:00 in Hà Nội on a Tuesday.
const now = Date.parse('2026-09-29T03:00:00.000Z')

const state = (id: string, s: Partial<SrsState>): SrsState => ({ ...initialSrsState(id, now), ...s })
const card = (id: string, lang: LangCode, s: Partial<SrsState>): ReviewCard => ({
  id, lang, headword: id, reading: null, ipa: null, meaningVi: null, meaningEn: null,
  example: null, exampleTranslation: null, audioUrl: null, state: state(id, s),
})

function loaded(): Loaded {
  return {
    now,
    stats: {
      total: 5, due: 2, learned: 1, reviewedToday: 0, streak: 1,
      byStatus: { new: 1, learning: 3, known: 1 }, byLang: { en: 2, es: 0, zh: 3 },
    },
    rows: [],
    progress: {
      en: { total: 2, learned: 0, learning: 1, unseen: 1 },
      es: { total: 0, learned: 0, learning: 0, unseen: 0 },
      zh: { total: 3, learned: 1, learning: 2, unseen: 0 },
    },
    queue: [
      card('new-en', 'en', { reps: 0, scheduledDays: 0, dueAt: now - DAY }),
      card('ripe-zh', 'zh', { reps: 3, scheduledDays: 20, dueAt: now - 3600_000 }),
    ],
    leeches: [],
    upcoming: [{ id: 'later', lang: 'es', headword: 'later', dueAt: now + 2 * DAY }],
    days: ['2026-09-28'],
  }
}

describe('summarize', () => {
  it('shows what was loaded when nothing is graded yet', () => {
    const v = summarize(loaded(), new Map())
    expect(v).toMatchObject({ due: 2, total: 5, learned: 1, reviewedToday: 0, streak: 1, gradedNow: 0 })
    expect(v.pending.map((c) => c.id)).toEqual(['new-en', 'ripe-zh'])
    expect(v.forecast.map((d) => d.count)).toEqual([2, 0, 1, 0, 0, 0, 0])
  })

  it('moves each graded card out of today and onto the day its new schedule names', () => {
    const d = loaded()
    const graded = new Map([
      ['new-en', state('new-en', { reps: 1, scheduledDays: 1, dueAt: now + DAY })],
      ['ripe-zh', state('ripe-zh', { reps: 4, scheduledDays: 25, dueAt: now + 25 * DAY })],
    ])
    const v = summarize(d, graded)
    expect(v).toMatchObject({ due: 0, reviewedToday: 2, gradedNow: 2, pending: [] })
    expect(v.forecast.map((f) => f.count)).toEqual([0, 1, 1, 0, 0, 0, 0])
    expect(v.forecast[1].words.map((w) => w.id)).toEqual(['new-en'])
  })

  it('shifts each graded card between progress parts and counts one that matures as learned', () => {
    const d = loaded()
    const v = summarize(d, new Map([
      ['new-en', state('new-en', { reps: 1, scheduledDays: 1, dueAt: now + DAY })],
      ['ripe-zh', state('ripe-zh', { reps: 4, scheduledDays: 25, dueAt: now + 25 * DAY })],
    ]))
    expect(v.progress.en).toEqual({ total: 2, learned: 0, learning: 2, unseen: 0 })
    expect(v.progress.zh).toEqual({ total: 3, learned: 2, learning: 1, unseen: 0 })
    expect(v.learned).toBe(2)
    expect(d.progress.en).toEqual({ total: 2, learned: 0, learning: 1, unseen: 1 })
  })

  it('keeps a word graded Lại in the session, last, with the schedule it earned', () => {
    const soon = state('new-en', { reps: 1, scheduledDays: 0, dueAt: now + 10 * 60_000 })
    const v = summarize(loaded(), new Map([['new-en', soon]]), ['new-en'])
    expect(v.pending.map((c) => c.id)).toEqual(['ripe-zh', 'new-en'])
    expect(v.pending[1].state).toBe(soon)
    // Still due today, so the count the next session hands over does not drop.
    expect(v.due).toBe(2)
    expect(v.forecast[0].count).toBe(2)
  })

  it('puts the words graded Lại back in the order they were last graded', () => {
    const d = loaded()
    const later = (id: string) => state(id, { reps: 1, dueAt: now + 60_000 })
    const v = summarize(d, new Map([['new-en', later('new-en')], ['ripe-zh', later('ripe-zh')]]), ['ripe-zh', 'new-en'])
    expect(v.pending.map((c) => c.id)).toEqual(['ripe-zh', 'new-en'])
  })

  it('drops due only for grades that leave today', () => {
    const v = summarize(loaded(), new Map([
      ['new-en', state('new-en', { reps: 1, dueAt: now + 10 * 60_000 })],
      ['ripe-zh', state('ripe-zh', { reps: 4, scheduledDays: 25, dueAt: now + 25 * DAY })],
    ]))
    expect(v.due).toBe(1)
  })

  it('counts a word reviewed earlier today once in today’s reviews', () => {
    const d = loaded()
    // Graded at 09:00 on another page, before the home page loaded.
    d.queue[0] = card('new-en', 'en', { reps: 1, scheduledDays: 0, dueAt: now - 60_000, lastReviewedAt: now - 3600_000 })
    d.stats.reviewedToday = 1
    const v = summarize(d, new Map([
      ['new-en', state('new-en', { reps: 2, scheduledDays: 1, dueAt: now + DAY })],
      ['ripe-zh', state('ripe-zh', { reps: 4, scheduledDays: 25, dueAt: now + 25 * DAY })],
    ]))
    expect(v.reviewedToday).toBe(2)
  })

  it('makes today a study day on the first grade, so the streak grows by one', () => {
    const v = summarize(loaded(), new Map([['new-en', state('new-en', { reps: 1, scheduledDays: 1, dueAt: now + DAY })]]))
    expect(v.streak).toBe(2)
    expect(v.days.has('2026-09-29')).toBe(true)
  })
})
