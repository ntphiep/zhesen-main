import { describe, it, expect } from 'vitest'
import { cleanGlossTerm, entryPivots } from '@/lib/dictionary/crosslang'

describe('cleanGlossTerm', () => {
  it('keeps short single-word translations, stripping a leading article/"to"', () => {
    expect(cleanGlossTerm('year')).toBe('year')
    expect(cleanGlossTerm('to develop')).toBe('develop')
    expect(cleanGlossTerm('a dog')).toBe('dog')
    expect(cleanGlossTerm('The Sun')).toBe('sun')
    expect(cleanGlossTerm('very')).toBe('very')
  })
  it('rejects definitions and phrases, not single equivalents', () => {
    expect(cleanGlossTerm('now (at the present time)')).toBeNull()
    expect(cleanGlossTerm('goods; property; possessions')).toBeNull()
    expect(cleanGlossTerm('each; every')).toBeNull()
    expect(cleanGlossTerm('plural of año')).toBeNull()
    expect(cleanGlossTerm('')).toBeNull()
    expect(cleanGlossTerm(null)).toBeNull()
  })
})

describe('entryPivots', () => {
  it('uses the normalized headword itself for English', () => {
    expect(entryPivots('en', 'dog', ['a domesticated canine'])).toEqual(['dog'])
  })
  it('uses cleaned English glosses (deduped) for other languages', () => {
    expect(entryPivots('zh', '狗', ['dog', 'hound'])).toEqual(['dog', 'hound'])
    expect(entryPivots('es', 'perro', ['dog', 'a dog', 'now (x)'])).toEqual(['dog'])
  })
  it('returns no pivots when nothing is usable', () => {
    expect(entryPivots('zh', '吧', ['(particle); sentence-final marker'])).toEqual([])
  })
})
