import { describe, it, expect } from 'vitest'
import { computeWordlistStats, type StatRow } from '@/lib/wordlist/stats'

const iso = (s: string) => s
const now = Date.parse('2026-06-21T12:00:00.000Z')
const DAY = 86_400_000

const row = (over: Partial<StatRow>): StatRow => ({
  lang: 'en',
  status: 'new',
  srsIntervalDays: 0,
  srsDueAt: new Date(now).toISOString(),
  srsLastReviewedAt: null,
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
})
