import { describe, it, expect } from 'vitest'
import { pushRecent } from '@/lib/dictionary/recent'

describe('pushRecent', () => {
  it('adds a query to the front', () => {
    expect(pushRecent([], 'dog')).toEqual(['dog'])
    expect(pushRecent(['dog'], 'cat')).toEqual(['cat', 'dog'])
  })
  it('moves an existing query to the front (case-insensitive dedupe)', () => {
    expect(pushRecent(['dog', 'cat'], 'dog')).toEqual(['dog', 'cat'])
    expect(pushRecent(['Dog', 'cat'], 'dog')).toEqual(['dog', 'cat'])
  })
  it('trims and ignores empty queries', () => {
    expect(pushRecent(['dog'], '   ')).toEqual(['dog'])
    expect(pushRecent(['dog'], '  cat ')).toEqual(['cat', 'dog'])
  })
  it('caps the list length, dropping the oldest', () => {
    expect(pushRecent(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b'])
  })
})
