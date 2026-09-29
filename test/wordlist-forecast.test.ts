import { describe, it, expect } from 'vitest'
import { bucketForecast, dueNote, listUpcoming, whenLabel, type ForecastWord } from '@/lib/wordlist/forecast'
import { clientReturning } from './helpers/supabase'

const DAY = 86_400_000
// 10:00 in Hà Nội on a Tuesday.
const now = Date.parse('2026-09-29T03:00:00.000Z')
const word = (id: string, dueAt: number): ForecastWord => ({ id, lang: 'en', headword: id, dueAt })

describe('bucketForecast', () => {
  it('puts the session queue on today and each later review on its study day', () => {
    const days = bucketForecast(
      [word('due', now - 3 * DAY)],
      [word('tonight', Date.parse('2026-09-29T15:00:00.000Z')), word('tomorrow', now + DAY), word('sunday', now + 5 * DAY)],
      now, 7,
    )
    expect(days.map((d) => d.count)).toEqual([2, 1, 0, 0, 0, 1, 0])
    expect(days[0].words.map((w) => w.id)).toEqual(['due', 'tonight'])
  })

  // 00:30 on the 30th in Hà Nội is still the 29th in UTC.
  it('counts days in the study timezone, not in UTC', () => {
    const days = bucketForecast([], [word('late', Date.parse('2026-09-29T17:30:00.000Z'))], now, 7)
    expect(days.map((d) => d.count)).toEqual([0, 1, 0, 0, 0, 0, 0])
  })

  it('counts a word once and leaves out what falls past the window', () => {
    const w = word('a', now + DAY)
    const days = bucketForecast([w], [w, word('far', now + 9 * DAY)], now, 7)
    expect(days.reduce((n, d) => n + d.count, 0)).toBe(1)
  })
})

describe('listUpcoming', () => {
  it('asks for the words due after now and within the window, soonest first', async () => {
    const { client, builder } = clientReturning([{ id: 'w1', lang: 'zh', headword: '猫', fsrs_due_at: '2026-09-30T01:00:00.000Z' }])
    const out = await listUpcoming(client, now, 7)
    expect(builder.gt).toHaveBeenCalledWith('fsrs_due_at', new Date(now).toISOString())
    expect(builder.lt).toHaveBeenCalledWith('fsrs_due_at', new Date(now + 7 * DAY).toISOString())
    expect(builder.order).toHaveBeenCalledWith('fsrs_due_at', { ascending: true })
    expect(out).toEqual([{ id: 'w1', lang: 'zh', headword: '猫', dueAt: Date.parse('2026-09-30T01:00:00.000Z') }])
  })
})

describe('when a word comes back', () => {
  it('names today, tomorrow, the weekday within a week, else the date', () => {
    expect(whenLabel(now + 3600_000, now)).toBe('hôm nay')
    expect(whenLabel(now + DAY, now)).toBe('ngày mai')
    expect(whenLabel(now + 2 * DAY, now)).toBe('Thứ Năm 1/10')
    expect(whenLabel(now + 10 * DAY, now)).toBe('9/10')
  })

  it('says whether a due word is new, late or due today', () => {
    expect(dueNote(0, now - 5 * DAY, now)).toBe('mới lưu, chưa ôn')
    expect(dueNote(3, now - 2 * DAY, now)).toBe('quá hạn 2 ngày')
    expect(dueNote(3, now - 3600_000, now)).toBe('đến hạn hôm nay')
  })
})
