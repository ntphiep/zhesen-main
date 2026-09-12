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
  // The contract changed on 2026-09-12. It used to reject any gloss containing a
  // bracket or a semicolon, which is how most Spanish and Chinese senses are
  // written -- "dog (the species Canis familiaris ...)" for perro. The panel found
  // nothing for those words. The head of the gloss is now taken instead.
  it('takes the equivalent that leads a gloss and drops the definition after it', () => {
    expect(cleanGlossTerm('now (at the present time)')).toBe('now')
    expect(cleanGlossTerm('dog (the species Canis familiaris)')).toBe('dog')
    expect(cleanGlossTerm('goods; property; possessions')).toBe('goods')
    expect(cleanGlossTerm('each; every')).toBe('each')
  })
  it('still rejects a gloss with no equivalent to lead with', () => {
    expect(cleanGlossTerm('plural of año')).toBeNull()
    expect(cleanGlossTerm('(particle); marker')).toBeNull()
    expect(cleanGlossTerm('CL:隻|只[zhi1]')).toBeNull()
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
    expect(entryPivots('es', 'perro', ['dog (the species)', 'a dog', 'clothes peg, clothespin']))
      .toEqual(['dog', 'clothes peg'])
  })
  it('returns no pivots when nothing is usable', () => {
    expect(entryPivots('zh', '吧', ['(particle); sentence-final marker'])).toEqual([])
  })
})
