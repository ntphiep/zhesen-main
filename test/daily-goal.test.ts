import { describe, it, expect } from 'vitest'
import { DEFAULT_GOAL, GOAL_CHOICES, goalProgress, parseGoal } from '@/lib/wordlist/goal'
import { computeWordlistStats, type StatRow } from '@/lib/wordlist/stats'

const now = Date.parse('2026-06-21T12:00:00.000Z') // 19:00 on the 21st in Vietnam

const reviewedAt = (iso: string | null): StatRow => ({
  lang: 'en',
  status: 'learning',
  srsIntervalDays: 1,
  srsDueAt: '2026-06-25T00:00:00.000Z',
  srsLastReviewedAt: iso,
  srsReps: 1,
})

describe('parseGoal', () => {
  it('defaults to 20 words', () => {
    expect(DEFAULT_GOAL).toBe(20)
    expect(parseGoal(null)).toBe(20)
  })

  it('keeps a stored choice and refuses anything outside the choices', () => {
    expect(GOAL_CHOICES).toEqual([10, 20, 30, 50])
    expect(parseGoal('30')).toBe(30)
    expect(parseGoal('25')).toBe(20)
    expect(parseGoal('')).toBe(20)
    expect(parseGoal('abc')).toBe(20)
  })
})

describe('goalProgress', () => {
  it('reports the share done and what is left', () => {
    expect(goalProgress(0, 20)).toEqual({ done: 0, goal: 20, left: 20, share: 0, met: false })
    expect(goalProgress(12, 20)).toEqual({ done: 12, goal: 20, left: 8, share: 0.6, met: false })
  })

  it('is met at the goal and stays full past it', () => {
    expect(goalProgress(20, 20)).toEqual({ done: 20, goal: 20, left: 0, share: 1, met: true })
    expect(goalProgress(26, 20)).toEqual({ done: 26, goal: 20, left: 0, share: 1, met: true })
  })
})

describe("today's goal count", () => {
  it('counts each word whose last review falls on today in the study timezone', () => {
    const rows = [
      reviewedAt('2026-06-20T17:30:00.000Z'), // 00:30 on the 21st in Vietnam: today
      reviewedAt('2026-06-21T11:59:00.000Z'), // 18:59 on the 21st: today
      reviewedAt('2026-06-20T16:30:00.000Z'), // 23:30 on the 20th: yesterday
      reviewedAt('2026-06-21T17:00:00.000Z'), // 00:00 on the 22nd: not today
      reviewedAt(null),
    ]
    expect(computeWordlistStats(rows, [], now).reviewedToday).toBe(2)
  })
})
