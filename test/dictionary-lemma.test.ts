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

  // Glosses from the full English import, measured on production.
  it('ignores a pointer word inside a definition', () => {
    const memorial = sense('A statement of facts set out in the form of a petition to a person in authority.')
    expect(lemmaFromSenses([sense('Serving to commemorate.'), memorial], 'memorial')).toBeNull()
    const weak = sense('In a conjugation other than singular active forms (regardless of person).')
    expect(lemmaFromSenses([sense('Lacking in force.'), weak], 'weak')).toBeNull()
    expect(lemmaFromSenses([sense('A form of government.')], 'democracy')).toBeNull()
  })

  it('reads the Spanish pointers', () => {
    expect(lemmaFromSenses([sense('feminine singular of bueno')], 'buena')).toBe('bueno')
    const imperative = sense('informal second-person singular (tú) affirmative imperative of hablar')
    expect(lemmaFromSenses([sense('A talk.'), imperative], 'habla')).toBe('hablar')
  })

  it('reads a spelling pointer only when it is the first sense', () => {
    const give = [sense('To transfer one\'s possession of something to someone.'), sense('Alternative form of gyve.')]
    expect(lemmaFromSenses(give, 'give')).toBeNull()
    expect(lemmaFromSenses([sense('Misspelling of advise.')], 'advize')).toBe('advise')
    expect(lemmaFromSenses([sense('Alternative spelling of color')], 'colour')).toBe('color')
  })

  it('ignores a pointer after sense 15', () => {
    const run = [...Array.from({ length: 117 }, () => sense('To move swiftly.')), sense('past participle of rin')]
    expect(lemmaFromSenses(run, 'run')).toBeNull()
    const saw = [...Array.from({ length: 14 }, () => sense('A tool for cutting.')), sense('simple past of see')]
    expect(lemmaFromSenses(saw, 'saw')).toBe('see')
  })
})
