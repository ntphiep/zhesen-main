import { describe, it, expect, beforeEach } from 'vitest'
import { pushRecent, readRecent, writeRecent } from '@/lib/dictionary/recent'

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

describe('readRecent', () => {
  beforeEach(() => localStorage.clear())

  it('returns the stored list', () => {
    writeRecent(['dog', 'cat'])
    expect(readRecent()).toEqual(['dog', 'cat'])
  })

  it('returns an empty list when nothing is stored', () => {
    expect(readRecent()).toEqual([])
  })

  // The page casts this value to string[] and hands it straight to .map(), so
  // anything that is not a list of strings must come back as an empty list, or
  // the render throws and the user gets a blank page.
  it('survives a key holding something that is not a list of strings', () => {
    localStorage.setItem('zhesen:recent-searches', '{"a":1}')
    expect(readRecent()).toEqual([])
    localStorage.setItem('zhesen:recent-searches', '[1,2,3]')
    expect(readRecent()).toEqual([])
    localStorage.setItem('zhesen:recent-searches', 'not json at all')
    expect(readRecent()).toEqual([])
  })
})
