import { describe, it, expect } from 'vitest'
import { initialSrsState, review } from '@/lib/progress/srs'
import type { SrsState } from '@/lib/progress/types'

// Expected values from ts-fsrs 5.4.2 with learning steps 1m and 10m, relearning 10m and fuzz,
// the owner's decision of 2026-10-05.
const T0 = Date.parse('2026-10-05T03:00:00.000Z')
const MIN = 60_000
const DAY = 86_400_000

const mature = (at: number): SrsState => ({
  vocabId: 'v', stability: 20, difficulty: 5, elapsedDays: 0, scheduledDays: 20, learningSteps: 0,
  reps: 5, lapses: 0, cardState: 'review', dueAt: at, lastReviewedAt: at - 20 * DAY,
})

describe('learning and relearning steps', () => {
  it('keeps a new word in learning for ten minutes, then sends it to review for two days', () => {
    const first = review(initialSrsState('v', T0), 'good', T0)
    expect(first.cardState).toBe('learning')
    expect(first.dueAt).toBe(T0 + 10 * MIN)
    const second = review(first, 'good', first.dueAt)
    expect(second.cardState).toBe('review')
    expect(second.scheduledDays).toBe(2)
  })

  it('graduates a word failed in its first session after two steps, one day out, with no lapse', () => {
    let s = review(initialSrsState('v', T0), 'again', T0)
    expect(s.cardState).toBe('learning')
    s = review(s, 'good', T0 + 2 * MIN)
    expect(s.cardState).toBe('learning')
    s = review(s, 'good', T0 + 12 * MIN)
    expect(s.cardState).toBe('review')
    expect(s.scheduledDays).toBe(1)
    expect(s.lapses).toBe(0)
  })

  it('counts one lapse for a review card failed twice in a session', () => {
    let s = review(mature(T0), 'again', T0)
    expect(s.cardState).toBe('relearning')
    expect(s.dueAt).toBe(T0 + 10 * MIN)
    s = review(s, 'again', T0 + 2 * MIN)
    s = review(s, 'good', T0 + 12 * MIN)
    expect(s.lapses).toBe(1)
    expect(s.cardState).toBe('review')
    expect(s.scheduledDays).toBe(1)
  })

  it('spreads twenty identical cards over several intervals around 59 days', () => {
    const intervals = Array.from({ length: 20 }, (_, i) => {
      const at = T0 + i * 1000
      return review({ ...mature(at + 20 * DAY), lastReviewedAt: at }, 'good', at + 20 * DAY).scheduledDays
    })
    expect(new Set(intervals).size).toBeGreaterThan(3)
    for (const d of intervals) {
      expect(d).toBeGreaterThanOrEqual(54)
      expect(d).toBeLessThanOrEqual(64)
    }
  })
})
