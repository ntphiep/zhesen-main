import { describe, it, expect } from 'vitest'
import { parseCsvTable, parseImportCsv, UnterminatedQuoteError } from '@/lib/wordlist/csv'

/**
 * A stray double quote — easy to produce, since example sentences are full of
 * them — used to make the parser absorb the rest of the file into one field and
 * report the truncated result as a clean parse. The import preview then offered a
 * handful of rows and the rest of the user's words vanished without a word.
 */
describe('an unterminated quote', () => {
  const good = 'headword,lang\ndog,en\ncat,en\n'

  it('parses a well-formed file as before', () => {
    expect(parseCsvTable(good)).toEqual([['headword', 'lang'], ['dog', 'en'], ['cat', 'en']])
  })

  it('is rejected instead of silently eating the rest of the file', () => {
    const broken = 'headword,lang\ndog,en\n"cat,en\nbird,en\nfish,en\n'
    expect(() => parseCsvTable(broken)).toThrow(UnterminatedQuoteError)
  })

  it('names the line the quote was opened on', () => {
    const broken = 'headword,lang\na,en\nb,en\n"c,en\nd,en\n'
    try {
      parseCsvTable(broken)
      throw new Error('đáng lẽ phải ném lỗi')
    } catch (e) {
      expect(e).toBeInstanceOf(UnterminatedQuoteError)
      expect((e as UnterminatedQuoteError).line).toBe(4)
    }
  })

  it('counts lines inside a legitimately quoted multi-line field', () => {
    const broken = 'headword,example\na,"line one\nline two"\n"b,en\n'
    try {
      parseCsvTable(broken)
      throw new Error('đáng lẽ phải ném lỗi')
    } catch (e) {
      expect((e as UnterminatedQuoteError).line).toBe(4)
    }
  })

  it('still accepts doubled quotes and quoted commas', () => {
    const table = parseCsvTable('headword,note\ndog,"says ""woof"", loudly"\n')
    expect(table[1]).toEqual(['dog', 'says "woof", loudly'])
  })

  it('surfaces one error row from the import preview rather than a partial list', () => {
    const broken = 'headword,lang\ndog,en\n"cat,en\nbird,en\n'
    const rows = parseImportCsv(broken, [])
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('error')
    expect(rows[0].kind === 'error' && rows[0].message).toMatch(/không được đóng/)
  })
})
