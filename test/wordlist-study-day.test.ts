import { describe, it, expect } from 'vitest'
import { studyDay, studyDayEnd, studyDayStart, streakState } from '@/lib/wordlist/activity'
import { initialSrsState, review } from '@/lib/progress/srs'
import { countDueCards, listDueCards } from '@/lib/wordlist/review'
import { clientReturning } from './helpers/supabase'

// A study day runs from 04:00 to 04:00 in Hà Nội (UTC+7), Anki's "next day starts at".
const ict = (iso: string) => Date.parse(`${iso}+07:00`)

describe('the study day', () => {
  it('rolls over at 04:00 in Hà Nội, not at midnight', () => {
    expect(studyDay(ict('2026-10-06T03:59:00'))).toBe('2026-10-05')
    expect(studyDay(ict('2026-10-06T04:00:00'))).toBe('2026-10-06')
    expect(studyDayStart(ict('2026-10-06T08:00:00'))).toBe(ict('2026-10-06T04:00:00'))
    expect(studyDayEnd(ict('2026-10-06T02:00:00'))).toBeLessThan(ict('2026-10-06T04:00:00'))
    expect(studyDayEnd(ict('2026-10-06T02:00:00'))).toBeGreaterThan(ict('2026-10-06T03:59:59'))
  })

  it('still reads 01:30 as the day before, so a streak that ended yesterday evening is open', () => {
    const nightOwl = ict('2026-10-06T01:30:00')
    expect(streakState(['2026-10-03', '2026-10-04'], nightOwl).days).toBe(2)
  })
})

describe('elapsed days in the scheduler', () => {
  it('counts a forgotten word answered 15 minutes later across 07:00 as the same day', () => {
    const forgotten = review(initialSrsState('v', 0), 'again', ict('2026-10-05T06:50:00'))
    const good = review(forgotten, 'good', ict('2026-10-05T07:05:00'))
    expect(good.elapsedDays).toBe(0)
  })

  it('counts a review at 06:00 on the next study day as one day later', () => {
    const at = ict('2026-10-05T08:00:00')
    const card = { ...initialSrsState('v', at), stability: 2.3, difficulty: 5, reps: 3, scheduledDays: 1,
      cardState: 'review' as const, lastReviewedAt: at, dueAt: at + 86_400_000 }
    expect(review(card, 'good', ict('2026-10-06T06:00:00')).elapsedDays).toBe(1)
  })
})

describe('the due queue', () => {
  it('hands over at 08:00 a card due at 22:00 the same day', async () => {
    const { client, builder } = clientReturning([])
    await listDueCards(client, ict('2026-10-05T08:00:00'))
    const [, dueBy] = (builder.lte as { mock: { calls: [string, string][] } }).mock.calls[0]
    expect(Date.parse(dueBy)).toBeGreaterThan(ict('2026-10-05T22:00:00'))
    expect(Date.parse(dueBy)).toBeLessThan(ict('2026-10-06T04:00:00'))
  })

  it('counts with the same cutoff', async () => {
    const { client, builder } = clientReturning([])
    await countDueCards(client, ict('2026-10-05T08:00:00'))
    const [, dueBy] = (builder.lte as { mock: { calls: [string, string][] } }).mock.calls[0]
    expect(Date.parse(dueBy)).toBeGreaterThan(ict('2026-10-05T22:00:00'))
  })
})
