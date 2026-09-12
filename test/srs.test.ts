import { describe, it, expect } from 'vitest'
import { initialSrsState, review } from '@/lib/progress/srs'

const T0 = 1_000_000_000_000 // fixed "now"

describe('srs (FSRS-6 via ts-fsrs)', () => {
  it('initial state is a brand-new card, due immediately', () => {
    const s = initialSrsState('v1', T0)
    expect(s).toMatchObject({
      vocabId: 'v1',
      stability: 0,
      difficulty: 0,
      scheduledDays: 0,
      learningSteps: 0,
      reps: 0,
      lapses: 0,
      cardState: 'new',
      dueAt: T0,
      lastReviewedAt: null,
    })
  })

  it('consecutive "good" reviews grow the interval each time', () => {
    let s = initialSrsState('v1', T0)
    const scheduled: number[] = []
    for (let i = 0; i < 3; i++) {
      s = review(s, 'good', s.dueAt)
      scheduled.push(s.scheduledDays)
    }
    expect(s.reps).toBe(3)
    expect(s.cardState).toBe('review')
    expect(scheduled).toEqual([3, 14, 57])
    expect(scheduled[0]).toBeLessThan(scheduled[1])
    expect(scheduled[1]).toBeLessThan(scheduled[2])
  })

  it('"again" shortens the interval and counts a lapse', () => {
    let s = initialSrsState('v1', T0)
    s = review(s, 'good', s.dueAt)
    s = review(s, 'good', s.dueAt)
    const beforeInterval = s.scheduledDays
    s = review(s, 'again', s.dueAt)
    expect(s.lapses).toBe(1)
    expect(s.scheduledDays).toBeLessThan(beforeInterval)
    expect(s.reps).toBe(3) // reps counts every review, including lapses
  })

  it('lastReviewedAt tracks the review time', () => {
    const s = review(initialSrsState('v1', T0), 'good', T0)
    expect(s.lastReviewedAt).toBe(T0)
  })

  it('repeated "again" keeps shrinking stability without going negative', () => {
    let s = initialSrsState('v1', T0)
    s = review(s, 'good', s.dueAt)
    let prevStability = s.stability
    for (let i = 0; i < 5; i++) {
      s = review(s, 'again', s.dueAt)
      expect(s.stability).toBeLessThan(prevStability)
      expect(s.stability).toBeGreaterThanOrEqual(0)
      prevStability = s.stability
    }
    expect(s.lapses).toBe(5)
  })

  it('"easy" schedules further out than "good" from a new card', () => {
    const good = review(initialSrsState('v1', T0), 'good', T0)
    const easy = review(initialSrsState('v2', T0), 'easy', T0)
    expect(easy.scheduledDays).toBeGreaterThan(good.scheduledDays)
  })

  it('"hard" schedules sooner than "good" from a new card', () => {
    const hard = review(initialSrsState('v1', T0), 'hard', T0)
    const good = review(initialSrsState('v2', T0), 'good', T0)
    expect(hard.scheduledDays).toBeLessThan(good.scheduledDays)
    expect(hard.lapses).toBe(0)
  })
})
