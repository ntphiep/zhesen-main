import { describe, it, expect } from 'vitest'
import { dayNumber, pickByDay } from '@/lib/dictionary/wordOfDay'

const DAY = 86_400_000
const noonToday = Date.parse('2026-06-21T12:00:00.000Z')

describe('dayNumber', () => {
  it('is stable within a day and increments by 1 the next day', () => {
    expect(dayNumber(noonToday)).toBe(dayNumber(noonToday + 1000)) // 1s later, same local day
    expect(dayNumber(noonToday + DAY)).toBe(dayNumber(noonToday) + 1)
  })
})

describe('pickByDay', () => {
  it('picks deterministically by day and rotates through the pool', () => {
    const pool = ['a', 'b', 'c']
    const d0 = dayNumber(noonToday)
    expect(pickByDay(pool, d0)).toBe(pool[d0 % 3])
    expect(pickByDay(pool, d0 + 1)).toBe(pool[(d0 + 1) % 3])
  })
  it('returns null for an empty pool', () => {
    expect(pickByDay([], 5)).toBeNull()
  })
})
