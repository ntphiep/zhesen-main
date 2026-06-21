import { describe, it, expect } from 'vitest'
import { computeWordlistStats, type StatRow } from '@/lib/wordlist/stats'

const iso = (s: string) => s
const now = Date.parse('2026-06-21T12:00:00.000Z')
const DAY = 86_400_000

const row = (over: Partial<StatRow>): StatRow => ({
  srsIntervalDays: 0,
  srsDueAt: new Date(now).toISOString(),
  srsLastReviewedAt: null,
  ...over,
})

describe('computeWordlistStats', () => {
  it('counts total, due, mature ("đã thuộc"), and reviewed-today', () => {
    const rows: StatRow[] = [
      row({ srsDueAt: iso(new Date(now - DAY).toISOString()) }), // due (past)
      row({ srsDueAt: iso(new Date(now + DAY).toISOString()) }), // not due (future)
      row({ srsIntervalDays: 30, srsDueAt: iso(new Date(now + 30 * DAY).toISOString()) }), // mature, not due
      row({ srsLastReviewedAt: iso(new Date(now).toISOString()), srsDueAt: iso(new Date(now + DAY).toISOString()) }), // reviewed today
      row({ srsLastReviewedAt: iso(new Date(now - 3 * DAY).toISOString()), srsDueAt: iso(new Date(now + DAY).toISOString()) }), // reviewed 3 days ago
    ]
    const s = computeWordlistStats(rows, now)
    expect(s.total).toBe(5)
    expect(s.due).toBe(1)
    expect(s.learned).toBe(1)
    expect(s.reviewedToday).toBe(1)
  })

  it('is all zeros for an empty wordlist', () => {
    expect(computeWordlistStats([], now)).toEqual({ total: 0, due: 0, learned: 0, reviewedToday: 0 })
  })
})
