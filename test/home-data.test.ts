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
    recent: [],
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

  it('makes today a study day on the first grade, so the streak grows by one', () => {
    const v = summarize(loaded(), new Map([['new-en', state('new-en', { reps: 1, scheduledDays: 1, dueAt: now + DAY })]]))
    expect(v.streak).toBe(2)
    expect(v.days.has('2026-09-29')).toBe(true)
  })
})
