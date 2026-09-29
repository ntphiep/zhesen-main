import { describe, it, expect } from 'vitest'
import { computeLangProgress, computeWordlistStats, type StatRow } from '@/lib/wordlist/stats'

const iso = (s: string) => s
const now = Date.parse('2026-06-21T12:00:00.000Z')
const DAY = 86_400_000

const row = (over: Partial<StatRow>): StatRow => ({
  lang: 'en',
  status: 'new',
  srsIntervalDays: 0,
  srsDueAt: new Date(now).toISOString(),
  srsLastReviewedAt: null,
  srsReps: 0,
  ...over,
})

describe('computeWordlistStats', () => {
  const localDay = (ts: number) => {
    const d = new Date(ts)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  it('counts total, due, mature ("đã thuộc"), reviewed-today, and streak', () => {
    const rows: StatRow[] = [
      row({ srsDueAt: iso(new Date(now - DAY).toISOString()) }), // due (past)
      row({ srsDueAt: iso(new Date(now + DAY).toISOString()) }), // not due (future)
      row({ srsIntervalDays: 30, srsDueAt: iso(new Date(now + 30 * DAY).toISOString()) }), // mature, not due
      row({ srsLastReviewedAt: iso(new Date(now).toISOString()), srsDueAt: iso(new Date(now + DAY).toISOString()) }), // reviewed today
      row({ srsLastReviewedAt: iso(new Date(now - 3 * DAY).toISOString()), srsDueAt: iso(new Date(now + DAY).toISOString()) }), // reviewed 3 days ago
    ]
    const s = computeWordlistStats(rows, [localDay(now), localDay(now - DAY)], now)
    expect(s.total).toBe(5)
    expect(s.due).toBe(1)
    expect(s.learned).toBe(1)
    expect(s.reviewedToday).toBe(1)
    expect(s.streak).toBe(2)
  })

  it('is all zeros for an empty wordlist', () => {
    expect(computeWordlistStats([], [], now)).toEqual({
      total: 0, due: 0, learned: 0, reviewedToday: 0, streak: 0,
      byStatus: { new: 0, learning: 0, known: 0 },
      byLang: { en: 0, es: 0, zh: 0 },
    })
  })

  it('tallies word counts by status and by language', () => {
    const rows: StatRow[] = [
      row({ lang: 'en', status: 'new' }),
      row({ lang: 'en', status: 'known' }),
      row({ lang: 'zh', status: 'learning' }),
      row({ lang: 'es', status: 'known' }),
    ]
    const s = computeWordlistStats(rows, [], now)
    expect(s.byStatus).toEqual({ new: 1, learning: 1, known: 2 })
    expect(s.byLang).toEqual({ en: 2, es: 1, zh: 1 })
  })

  // "Cần ôn" has to be what the session will actually hand over. A new card is
  // due the moment it is saved, so a flat count of overdue rows is dominated by
  // the backlog: measured on this project's own account, 406 rows were past due
  // while the session served 22. The learner finished, was told there was
  // nothing left, went back, and the label still said several hundred.
  it('reports what a session serves, not the size of the backlog', () => {
    const past = new Date(now - DAY).toISOString()
    const rows: StatRow[] = [
      ...Array.from({ length: 404 }, () => row({ srsDueAt: past, srsReps: 0 })),
      ...Array.from({ length: 2 }, () => row({ srsDueAt: past, srsReps: 3 })),
    ]
    expect(computeWordlistStats(rows, [], now).due).toBe(22)
  })

  it('counts every genuinely due review, up to the session limit', () => {
    const past = new Date(now - DAY).toISOString()
    const rows: StatRow[] = Array.from({ length: 80 }, () => row({ srsDueAt: past, srsReps: 5 }))
    // 50 reviews fill the session; no room is left for new cards.
    expect(computeWordlistStats(rows, [], now).due).toBe(50)
  })
})

describe('computeLangProgress', () => {
  it('splits each language into learned, learning and never graded', () => {
    const rows: StatRow[] = [
      row({ lang: 'en', srsIntervalDays: 30, srsReps: 6 }),
      row({ lang: 'en', srsIntervalDays: 4, srsReps: 2 }),
      row({ lang: 'en' }),
      row({ lang: 'zh', srsIntervalDays: 21, srsReps: 5 }),
    ]
    expect(computeLangProgress(rows)).toEqual({
      en: { total: 3, learned: 1, learning: 1, unseen: 1 },
      zh: { total: 1, learned: 1, learning: 0, unseen: 0 },
      es: { total: 0, learned: 0, learning: 0, unseen: 0 },
    })
  })
})
