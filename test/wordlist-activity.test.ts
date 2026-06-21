import { describe, it, expect } from 'vitest'
import { computeStreak, localDay } from '@/lib/wordlist/activity'

const DAY = 86_400_000
const now = Date.parse('2026-06-21T08:00:00.000Z')
const d = (offsetDays: number) => localDay(now - offsetDays * DAY)

describe('computeStreak', () => {
  it('counts consecutive days ending today', () => {
    expect(computeStreak([d(0), d(1), d(2)], now)).toBe(3)
  })
  it('keeps the streak alive if today is missing but yesterday is present', () => {
    expect(computeStreak([d(1), d(2)], now)).toBe(2)
  })
  it('counts only today when yesterday was missed', () => {
    expect(computeStreak([d(0), d(2), d(3)], now)).toBe(1)
  })
  it('is 0 when the last activity is older than yesterday, or there is none', () => {
    expect(computeStreak([d(2), d(3)], now)).toBe(0)
    expect(computeStreak([], now)).toBe(0)
  })
  it('ignores duplicate day entries', () => {
    expect(computeStreak([d(0), d(0), d(1)], now)).toBe(2)
  })
})
