import { describe, it, expect } from 'vitest'
import { computeStreak, localDay, streakState } from '@/lib/wordlist/activity'

const DAY = 86_400_000
const now = Date.parse('2026-06-21T08:00:00.000Z')
const d = (offsetDays: number) => localDay(now - offsetDays * DAY)
/** Every day from `from` days ago up to `to` days ago, both included. */
const span = (from: number, to: number) => Array.from({ length: from - to + 1 }, (_, i) => d(from - i))

describe('streakState', () => {
  it('is empty with no activity', () => {
    expect(streakState([], now)).toEqual({ days: 0, freezes: 0, savedYesterday: false })
  })

  it('earns one freeze for seven consecutive studied days', () => {
    expect(streakState(span(6, 0), now)).toEqual({ days: 7, freezes: 1, savedYesterday: false })
    expect(streakState(span(5, 0), now).freezes).toBe(0)
  })

  it('bridges a single missed day with a held freeze and spends it', () => {
    const s = streakState([...span(8, 2), d(0)], now)
    expect(s).toEqual({ days: 8, freezes: 0, savedYesterday: true })
    expect(computeStreak([...span(8, 2), d(0)], now)).toBe(8)
  })

  it('breaks on a single missed day when no freeze is held', () => {
    expect(streakState([...span(7, 2), d(0)], now)).toEqual({ days: 1, freezes: 0, savedYesterday: false })
  })

  it('breaks on two missed days in a row even with two freezes held', () => {
    expect(streakState([...span(16, 3), d(0)], now)).toEqual({ days: 1, freezes: 0, savedYesterday: false })
    expect(streakState(span(16, 3), now)).toEqual({ days: 0, freezes: 0, savedYesterday: false })
  })

  it('holds at most two freezes', () => {
    expect(streakState(span(20, 0), now)).toEqual({ days: 21, freezes: 2, savedYesterday: false })
    expect(streakState(span(27, 0), now).freezes).toBe(2)
  })

  it('restarts the seven-day count after a day a freeze covered', () => {
    // Ten studied, one frozen, five studied: counted across the gap this would earn a second.
    expect(streakState([...span(15, 6), ...span(4, 0)], now)).toEqual({ days: 15, freezes: 0, savedYesterday: false })
  })

  it('leaves today open: a freeze is not spent before today is over', () => {
    expect(streakState(span(7, 1), now)).toEqual({ days: 7, freezes: 1, savedYesterday: false })
  })

  it('spends a freeze on yesterday when today is not yet studied', () => {
    expect(streakState(span(8, 2), now)).toEqual({ days: 7, freezes: 0, savedYesterday: true })
  })

  it('ignores days after today', () => {
    expect(streakState([d(0), d(-1), d(-2)], now)).toEqual({ days: 1, freezes: 0, savedYesterday: false })
  })
})
