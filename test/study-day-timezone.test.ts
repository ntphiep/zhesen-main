import { describe, it, expect } from 'vitest'
import { localDay, computeStreak } from '@/lib/wordlist/activity'

/**
 * The study day is written by the browser and read back by the server, so it has
 * to mean the same thing in both places. These pin it to the reader's calendar
 * rather than whichever timezone the process happens to run in.
 */
describe('localDay', () => {
  it('uses the Vietnam calendar day, not the running process timezone', () => {
    // 23:05 UTC on the 11th is 06:05 on the 12th in Vietnam. A UTC server used to
    // read this back as the 11th and report the streak as broken.
    expect(localDay(Date.parse('2026-09-11T23:05:00.000Z'))).toBe('2026-09-12')
  })

  it('rolls over at Vietnam midnight', () => {
    expect(localDay(Date.parse('2026-09-11T16:59:59.000Z'))).toBe('2026-09-11')
    expect(localDay(Date.parse('2026-09-11T17:00:00.000Z'))).toBe('2026-09-12')
  })

  it('pads single-digit months and days', () => {
    expect(localDay(Date.parse('2026-01-05T05:00:00.000Z'))).toBe('2026-01-05')
  })
})

describe('computeStreak across the UTC day boundary', () => {
  it('counts a morning session logged just after Vietnam midnight', () => {
    const morning = Date.parse('2026-09-11T23:05:00.000Z') // 06:05 on the 12th
    const days = ['2026-09-10', '2026-09-11', '2026-09-12']
    expect(computeStreak(days, morning)).toBe(3)
  })

  it('survives a day not yet practised, then breaks', () => {
    const now = Date.parse('2026-09-12T10:00:00.000Z')
    expect(computeStreak(['2026-09-10', '2026-09-11'], now)).toBe(2)
    expect(computeStreak(['2026-09-09', '2026-09-10'], now)).toBe(0)
  })
})
