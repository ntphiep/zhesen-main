import { describe, it, expect } from 'vitest'
import { clampPage, pageCount, pageRange, pageSlice, isPageSize } from '@/lib/wordlist/paginate'

const list = Array.from({ length: 425 }, (_, i) => i + 1)

describe('page arithmetic', () => {
  it('counts the pages, including the short last one', () => {
    expect(pageCount(425, 50)).toBe(9)
    expect(pageCount(100, 50)).toBe(2)
  })

  // "Trang 1 / 0" is not a thing a reader can be on.
  it('keeps one page for an empty list', () => {
    expect(pageCount(0, 50)).toBe(1)
    expect(pageRange(0, 1, 50)).toEqual({ from: 0, to: 0 })
  })

  it('cuts the list at the page boundaries', () => {
    expect(pageSlice(list, 1, 50)[0]).toBe(1)
    expect(pageSlice(list, 2, 50)[0]).toBe(51)
    expect(pageSlice(list, 9, 50)).toHaveLength(25)
  })

  // Filtering 425 words down to 12 while page 7 is open must show the twelve.
  it('pulls a page past the end back to the last one', () => {
    expect(clampPage(7, 12, 50)).toBe(1)
    expect(pageSlice(list.slice(0, 12), 7, 50)).toHaveLength(12)
    expect(clampPage(0, 425, 50)).toBe(1)
    expect(clampPage(Number.NaN, 425, 50)).toBe(1)
  })

  it('numbers the rows on the page the way the footer reads them', () => {
    expect(pageRange(425, 2, 50)).toEqual({ from: 51, to: 100 })
    expect(pageRange(425, 9, 50)).toEqual({ from: 401, to: 425 })
  })

  it('accepts only the sizes the control offers', () => {
    expect(isPageSize(50)).toBe(true)
    expect(isPageSize(37)).toBe(false)
  })
})
