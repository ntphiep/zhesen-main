import { describe, it, expect } from 'vitest'
import { initialSrsState, review, DAY_MS } from '@/lib/progress/srs'

const T0 = 1_000_000_000_000 // fixed "now"

describe('srs', () => {
  it('initial state is due now with ease 2.5', () => {
    const s = initialSrsState('v1', T0)
    expect(s).toMatchObject({ vocabId: 'v1', intervalDays: 0, ease: 2.5, reps: 0, lapses: 0, dueAt: T0 })
  })

  it('first good review schedules 1 day out', () => {
    const s = review(initialSrsState('v1', T0), 'good', T0)
    expect(s.reps).toBe(1)
    expect(s.intervalDays).toBe(1)
    expect(s.dueAt).toBe(T0 + DAY_MS)
    expect(s.lastReviewedAt).toBe(T0)
  })

  it('second good review schedules 6 days out', () => {
    let s = review(initialSrsState('v1', T0), 'good', T0)
    s = review(s, 'good', s.dueAt)
    expect(s.reps).toBe(2)
    expect(s.intervalDays).toBe(6)
  })

  it('third good review multiplies by ease', () => {
    let s = initialSrsState('v1', T0)
    s = review(s, 'good', T0)        // 1
    s = review(s, 'good', s.dueAt)   // 6
    s = review(s, 'good', s.dueAt)   // round(6 * 2.5) = 15
    expect(s.intervalDays).toBe(15)
  })

  it('again resets reps, increments lapses, lowers ease, due immediately at review time', () => {
    let s = review(initialSrsState('v1', T0), 'good', T0)
    const s2 = review(s, 'again', s.dueAt)
    expect(s2.reps).toBe(0)
    expect(s2.lapses).toBe(1)
    expect(s2.intervalDays).toBe(0)
    expect(s2.dueAt).toBe(s.dueAt)
    expect(s2.ease).toBeCloseTo(2.3, 5)
  })

  it('again is due at review time even when reviewed late', () => {
    const first = review(initialSrsState('v1', T0), 'good', T0) // due at T0 + DAY_MS
    const late = first.dueAt + 2 * DAY_MS
    const s = review(first, 'again', late)
    expect(s.dueAt).toBe(late)
    expect(s.intervalDays).toBe(0)
    expect(s.lastReviewedAt).toBe(late)
  })

  it('ease never drops below 1.3', () => {
    let s = initialSrsState('v1', T0)
    for (let i = 0; i < 20; i++) s = review(s, 'again', T0)
    expect(s.ease).toBeGreaterThanOrEqual(1.3)
  })

  it('easy raises ease and schedules further than good', () => {
    const good = review(initialSrsState('v1', T0), 'good', T0)
    const easy = review(initialSrsState('v2', T0), 'easy', T0)
    expect(easy.ease).toBeGreaterThan(2.5)
    expect(easy.intervalDays).toBeGreaterThan(good.intervalDays)
  })

  it('hard grows interval modestly and lowers ease', () => {
    let s = initialSrsState('v1', T0)
    s = review(s, 'good', T0)        // interval 1, ease 2.5
    const hard = review(s, 'hard', s.dueAt)
    expect(hard.ease).toBeCloseTo(2.35, 5)
    expect(hard.intervalDays).toBe(1)
    expect(hard.reps).toBe(2)
  })
})
