import { describe, it, expect } from 'vitest'
import { calendarDays, CALENDAR_WEEKS, recommend, summarizeEvents, type FailingWord } from '@/lib/practice/today'
import { computeTodayPlan, type StatRow } from '@/lib/wordlist/stats'
import { sinceLabel } from '@/lib/wordlist/activity'
import type { UserWord } from '@/lib/wordlist/types'

const NOW = Date.parse('2026-10-14T03:00:00Z') // Wednesday, 10:00 in Hà Nội
const DAY = 86_400_000

const event = (at: string, mode: string, rating = 3, word = 'w1') => ({ word_id: word, mode, rating, reviewed_at: at })

describe('the hub calendar', () => {
  it('runs Monday first for twelve weeks, ending with the current week', () => {
    const days = calendarDays(NOW)
    expect(days).toHaveLength(CALENDAR_WEEKS * 7)
    expect(days.at(-7)).toBe('2026-10-12') // this week's Monday
    expect(days.at(-1)).toBe('2026-10-18')
    expect(new Date(`${days[0]}T00:00:00Z`).getUTCDay()).toBe(1)
  })

  it('counts an answer at 02:00 for the evening before, and keeps a studied day with no answer logged', () => {
    const a = summarizeEvents([
      event('2026-10-13T19:00:00Z', 'quiz'), // 02:00 on the 14th in Hà Nội: still the 13th's study day
      event('2026-10-13T23:00:00Z', 'write'), // 06:00 on the 14th
    ], ['2026-10-01'], NOW)
    const day = (d: string) => a.calendar.find((c) => c.day === d)
    expect(day('2026-10-13')).toMatchObject({ answers: 1, studied: true })
    expect(day('2026-10-14')).toMatchObject({ answers: 1, studied: true, today: true })
    expect(day('2026-10-01')).toMatchObject({ answers: 0, studied: true })
    expect(day('2026-10-15')).toMatchObject({ future: true, studied: false })
  })
})

describe('summarizeEvents', () => {
  it('keeps each mode\'s last answer and counts misses of the last 30 days only', () => {
    const a = summarizeEvents([
      event('2026-10-10T03:00:00Z', 'quiz', 1, 'a'),
      event('2026-10-12T03:00:00Z', 'quiz', 1, 'a'),
      event('2026-08-01T03:00:00Z', 'write', 1, 'b'),
      event('2026-10-11T03:00:00Z', 'not-a-mode', 1, 'c'),
    ], [], NOW)
    expect(a.lastUsed).toEqual({ quiz: Date.parse('2026-10-12T03:00:00Z'), write: Date.parse('2026-08-01T03:00:00Z') })
    expect(a.fails.get('a')).toBe(2)
    expect(a.fails.has('b')).toBe(false)
  })
})

describe('computeTodayPlan', () => {
  const row = (srsReps: number, srsDueAt: string, recogDueAt: string, status: StatRow['status'] = 'learning'): StatRow => ({
    lang: 'en', status, srsIntervalDays: 1, srsDueAt, srsLastReviewedAt: null, srsReps, recogDueAt,
  })

  it('splits recall into due and new under the daily allowance, and counts recognition due', () => {
    const today = '2026-10-14T00:00:00Z'
    const later = '2026-10-20T00:00:00Z'
    const plan = computeTodayPlan([
      row(3, today, later),
      row(0, today, today),
      row(0, today, today),
      row(2, later, today),
      row(2, today, today, 'known'),
    ], NOW, 19)
    expect(plan).toEqual({ recallDue: 1, newCards: 1, recognitionDue: 3 })
  })
})

describe('recommend', () => {
  const plan = { recallDue: 0, newCards: 0, recognitionDue: 0 }
  const failing: FailingWord[] = [{ word: { id: 'w1' } as UserWord, misses: 3 }]

  it('puts recall first, then recognition, then the words missed most', () => {
    expect(recommend({ ...plan, recallDue: 4, newCards: 2 }, failing, {}, NOW)).toMatchObject({ mode: '/practice/review', reason: '4 từ cần ôn và 2 từ mới.' })
    expect(recommend({ ...plan, recognitionDue: 5 }, failing, {}, NOW)).toMatchObject({ mode: '/practice/quiz', href: '/practice/quiz?due=recognition' })
    expect(recommend(plan, failing, {}, NOW)).toMatchObject({ mode: '/practice/write', href: '/practice/write?word=w1', reason: '1 từ hay sai.' })
  })

  it('offers the mode left longest when nothing is due', () => {
    const used = { quiz: NOW - DAY, write: NOW - 3 * DAY, match: NOW, dictation: NOW, listen: NOW, cloze: NOW }
    expect(recommend(plan, [], used, NOW)).toMatchObject({ mode: '/practice/write', reason: 'Luyện lần cuối 3 ngày trước.' })
    expect(recommend(plan, [], {}, NOW)).toMatchObject({ mode: '/practice/quiz', reason: 'Chưa luyện cách này.' })
  })
})

describe('sinceLabel', () => {
  it('counts study days, so 02:00 belongs to the day before', () => {
    expect(sinceLabel(NOW, NOW)).toBe('Hôm nay')
    expect(sinceLabel(Date.parse('2026-10-13T19:00:00Z'), NOW)).toBe('Hôm qua')
    expect(sinceLabel(NOW - 5 * DAY, NOW)).toBe('5 ngày trước')
  })
})
