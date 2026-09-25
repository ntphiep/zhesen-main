import { describe, it, expect } from 'vitest'
import { parseCsvRows, parseImportCsv, UnterminatedQuoteError } from '@/lib/wordlist/csv'

/**
 * A stray double quote — easy to produce, since example sentences are full of
 * them — must not make the parser absorb the rest of the file into one field
 * and report a clean parse: that silently drops every row after it from the
 * import preview.
 */
describe('an unterminated quote', () => {
  const good = 'headword,lang\ndog,en\ncat,en\n'

  it('parses a well-formed file as before', () => {
    expect(parseCsvRows(good).map((r) => r.cells))
      .toEqual([['headword', 'lang'], ['dog', 'en'], ['cat', 'en']])
  })

  it('is rejected instead of silently eating the rest of the file', () => {
    const broken = 'headword,lang\ndog,en\n"cat,en\nbird,en\nfish,en\n'
    expect(() => parseCsvRows(broken)).toThrow(UnterminatedQuoteError)
  })

  it('names the line the quote was opened on', () => {
    const broken = 'headword,lang\na,en\nb,en\n"c,en\nd,en\n'
    try {
      parseCsvRows(broken)
      throw new Error('đáng lẽ phải ném lỗi')
    } catch (e) {
      expect(e).toBeInstanceOf(UnterminatedQuoteError)
      expect((e as UnterminatedQuoteError).line).toBe(4)
    }
  })

  it('counts lines inside a legitimately quoted multi-line field', () => {
    const broken = 'headword,example\na,"line one\nline two"\n"b,en\n'
    try {
      parseCsvRows(broken)
      throw new Error('đáng lẽ phải ném lỗi')
    } catch (e) {
      expect((e as UnterminatedQuoteError).line).toBe(4)
    }
  })

  it('still accepts doubled quotes and quoted commas', () => {
    const table = parseCsvRows('headword,note\ndog,"says ""woof"", loudly"\n')
    expect(table[1].cells).toEqual(['dog', 'says "woof", loudly'])
  })

  it('surfaces one error row from the import preview rather than a partial list', () => {
    const broken = 'headword,lang\ndog,en\n"cat,en\nbird,en\n'
    const rows = parseImportCsv(broken, [])
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('error')
    expect(rows[0].kind === 'error' && rows[0].message).toMatch(/thiếu dấu nháy kép đóng/)
  })
})
