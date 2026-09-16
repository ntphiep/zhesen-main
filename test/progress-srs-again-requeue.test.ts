import { describe, it, expect } from 'vitest'
import { initialSrsState, review } from '@/lib/progress/srs'

const T0 = Date.parse('2026-09-12T00:00:00.000Z')

/**
 * A card graded "again" comes back later in the same session. The second grade
 * has to continue from the lapsed state: re-queueing the card with the state it
 * held before the lapse computes the next interval from the wrong starting point
 * and undoes the lapse.
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
})
