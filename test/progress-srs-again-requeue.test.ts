import { describe, it, expect } from 'vitest'
import { initialSrsState, review } from '@/lib/progress/srs'

const T0 = Date.parse('2026-09-12T00:00:00.000Z')
const DAY = 86_400_000

/**
 * A card graded "again" is shown again later in the same session. The bug these
 * cover: the review screen used to re-queue the card with the state it had
 * *before* the lapse, so the second grade was computed from the wrong starting
 * point and undid the lapse entirely.
 */
describe('grading a lapsed card twice in one session', () => {
  function matured() {
    let s = initialSrsState('v1', T0)
    for (let i = 0; i < 3; i++) s = review(s, 'good', s.dueAt)
    return s
  }

  it('keeps the lapse when the second grade continues from the lapsed state', () => {
    const before = matured()
    const lapsed = review(before, 'again', before.dueAt)
    expect(lapsed.lapses).toBe(1)

    const afterGood = review(lapsed, 'good', lapsed.dueAt)
    expect(afterGood.lapses).toBe(1)
    expect(afterGood.scheduledDays).toBeLessThan(before.scheduledDays)
  })

  it('loses the lapse if the pre-lapse state is reused, which is what went wrong', () => {
    const before = matured()
    const lapsed = review(before, 'again', before.dueAt)
    const fromStaleState = review(before, 'good', lapsed.dueAt)

    expect(fromStaleState.lapses).toBe(0)
    expect(fromStaleState.scheduledDays).toBeGreaterThan(lapsed.scheduledDays)
  })
})

describe('a clock that runs backwards', () => {
  it('grades instead of throwing, and records the review when it happened', () => {
    // This used to assert that the card kept the LATER timestamp. It does not any
    // more: keeping it meant the next review clamped to it again and computed zero
    // elapsed days forever, so one bad clock reading took the card out of the
    // review queue permanently. See test/srs-clock.test.ts and lib/progress/srs.ts.
    const s = review(initialSrsState('v1', T0), 'good', T0)
    expect(s.lastReviewedAt).toBe(T0)

    const earlier = T0 - 5 * DAY
    expect(() => review(s, 'good', earlier)).not.toThrow()
    expect(review(s, 'good', earlier).lastReviewedAt).toBe(earlier)
  })

  it('still uses the real time when the clock is sane', () => {
    const s = review(initialSrsState('v1', T0), 'good', T0)
    const later = T0 + 3 * DAY
    expect(review(s, 'good', later).lastReviewedAt).toBe(later)
  })
})
