import { describe, it, expect } from 'vitest'
import { formatWordDate, isDueAt } from '@/lib/wordlist/format'

describe('formatWordDate', () => {
  // The same code runs on the server and again in the browser. Reading the
  // machine's timezone made those two disagree: on a UTC server this instant is
  // still 19 June, in Vietnam it is already the 20th. Every word saved after
  // 17:00 local time showed the wrong day in the server HTML and jumped after
  // hydration. These two instants straddle Vietnamese midnight, so the pair
  // fails on any machine that is not itself in this timezone.
  it('uses the study timezone, not the machine running it', () => {
    expect(formatWordDate('2026-06-19T16:59:00Z')).toBe('19/6/2026')
    expect(formatWordDate('2026-06-19T17:01:00Z')).toBe('20/6/2026')
  })

  it('gives the same answer whichever side rendered it', () => {
    const iso = '2026-09-13T20:30:00Z'
    expect(formatWordDate(iso)).toBe(formatWordDate(iso))
    expect(formatWordDate(iso)).toBe('14/9/2026')
  })

  it('hands back an unparseable value rather than throwing', () => {
    expect(formatWordDate('không phải ngày')).toBe('không phải ngày')
  })
})

describe('isDueAt', () => {
  const now = Date.parse('2026-09-16T10:00:00Z')

  // The wordlist renders DUE_LABEL from this answer. Callers used to compare the
  // rendered label against 'Cần ôn' instead, so renaming the label would have
  // silently changed the branch they took.
  it('is true at or before the due moment and false after it', () => {
    expect(isDueAt('2026-09-16T09:59:00Z', now)).toBe(true)
    expect(isDueAt('2026-09-16T10:01:00Z', now)).toBe(false)
    expect(isDueAt('2000-01-01T00:00:00Z', now)).toBe(true)
  })

  // Date.parse gives NaN here and every comparison with NaN is false, so an
  // unreadable value leaves the word alone rather than dragging it into the
  // review queue on every render.
  it('does not call an unparseable value due', () => {
    expect(isDueAt('không phải ngày', now)).toBe(false)
  })
})
