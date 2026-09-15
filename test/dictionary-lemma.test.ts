import { describe, it, expect } from 'vitest'
import { lemmaFromSenses } from '@/lib/dictionary/lemma'
import type { DictSense } from '@/lib/dictionary/types'

function sense(glossEn: string | null, glossVi: string | null = null): DictSense {
  return { pos: 'verb', glossVi, glossEn, senseOrder: 1 }
}

describe('lemmaFromSenses', () => {
  // The shape that made /dictionary/en/adjourned a dead end: the only thing the
  // page knew about the verb was this sentence, printed as English prose.
  it('reads the headword an inflected entry points at', () => {
    expect(lemmaFromSenses([sense('simple past and past participle of adjourn')], 'adjourned')).toBe('adjourn')
    expect(lemmaFromSenses([sense('plural of person: a body of persons.')], 'people')).toBe('person')
    expect(lemmaFromSenses([sense('third-person singular simple present of go')], 'goes')).toBe('go')
    expect(lemmaFromSenses([sense('comparative of good')], 'better')).toBe('good')
  })

  it('ignores a gloss that points back at the word itself', () => {
    expect(lemmaFromSenses([sense('plural of sheep')], 'sheep')).toBeNull()
  })

  it('leaves an ordinary definition alone', () => {
    expect(lemmaFromSenses([sense('A formal gathering of persons.')], 'congress')).toBeNull()
    expect(lemmaFromSenses([sense('To think of something.')], 'consider')).toBeNull()
    expect(lemmaFromSenses([sense(null, 'con chó')], 'dog')).toBeNull()
  })

  it('takes the first sense that names a lemma', () => {
    const senses = [sense('Having been adjourned; suspended.'), sense('past participle of adjourn')]
    expect(lemmaFromSenses(senses, 'adjourned')).toBe('adjourn')
  })
})
