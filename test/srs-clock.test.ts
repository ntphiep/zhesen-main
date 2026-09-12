import { describe, it, expect } from 'vitest'
import { initialSrsState, review } from '@/lib/progress/srs'

const DAY = 86_400_000
const T0 = Date.UTC(2026, 8, 12)

/**
 * A browser clock that runs fast, then gets corrected. ts-fsrs refuses a review
 * dated before the previous one, so the scheduler is handed the later timestamp —
 * but storing that timestamp back froze the card: every later review clamped to it
 * again, computed zero elapsed days, and left a due date in the future that
 * `listDueCards` would never select.
 */
describe('a clock that jumps forward and comes back', () => {
  const frozenByBadClock = () => {
    let s = initialSrsState('v1', T0)
    s = review(s, 'good', T0)
    return review(s, 'good', T0 + 365 * DAY)
  }

  it('records the review at the moment it actually happened', () => {
    const s = review(frozenByBadClock(), 'good', T0 + DAY)
    expect(s.lastReviewedAt).toBe(T0 + DAY)
  })

  it('brings the due date back onto the real timeline', () => {
    const s = review(frozenByBadClock(), 'good', T0 + DAY)
    expect(s.dueAt).toBeLessThan(T0 + 365 * DAY)
  })

  it('counts elapsed days again on the next review', () => {
    let s = review(frozenByBadClock(), 'good', T0 + DAY)
    s = review(s, 'good', T0 + 5 * DAY)
    expect(s.elapsedDays).toBe(4)
  })

  it('lets stability move again instead of freezing', () => {
    const recovered = frozenByBadClock()
    let s = review(recovered, 'good', T0 + DAY)
    const first = s.stability
    s = review(s, 'good', T0 + 30 * DAY)
    expect(s.stability).not.toBe(first)
  })

  it('still grades instead of throwing on a backwards clock', () => {
    let s = initialSrsState('v1', T0)
    s = review(s, 'good', T0 + 10 * DAY)
    expect(() => review(s, 'good', T0 + 5 * DAY)).not.toThrow()
  })

  it('leaves an ordinary review exactly as ts-fsrs scheduled it', () => {
    let s = initialSrsState('v1', T0)
    s = review(s, 'good', T0)
    const after = review(s, 'good', T0 + 3 * DAY)
    expect(after.lastReviewedAt).toBe(T0 + 3 * DAY)
    expect(after.elapsedDays).toBe(3)
    expect(after.dueAt).toBeGreaterThan(T0 + 3 * DAY)
  })
})
