import { describe, it, expect } from 'vitest'
import { formLineLemma, lemmaFromSenses, pointerLemma } from '@/lib/dictionary/lemma'
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

  // fed up named feed, and took off could not name take off at all.
  it('reads a lemma of as many words as the headword', () => {
    expect(lemmaFromSenses([sense('simple past and past participle of feed up')], 'fed up')).toBe('feed up')
    expect(lemmaFromSenses([sense('simple past of take off')], 'took off')).toBe('take off')
    expect(lemmaFromSenses([sense('simple past of take off in some senses')], 'took off')).toBe('take')
    expect(lemmaFromSenses([sense('plural of person in law')], 'people')).toBe('person')
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

  // casa printed "Dạng gốc: casar" because its third sense is a form of the verb.
  it('reads a pointer only in the part of speech the entry leads with', () => {
    const casa = [
      { ...sense('house'), pos: 'noun' },
      sense('inflection of casar:'),
      sense('third-person singular present indicative'),
    ]
    expect(lemmaFromSenses(casa, 'casa')).toBeNull()
    const breaking = [{ ...sense('The act by which something is broken.'), pos: 'noun' }, sense('present participle and gerund of break')]
    expect(lemmaFromSenses(breaking, 'breaking')).toBeNull()
    const better = [
      { ...sense('Greater in amount or quantity'), pos: 'adjective' },
      { ...sense('To improve.'), senseOrder: 2 },
      { ...sense('comparative degree of good and well'), pos: 'adjective', senseOrder: 3 },
    ]
    expect(lemmaFromSenses(better, 'better')).toBe('good')
  })

  // went's first sense is the obsolete noun "a path".
  it('leads with the first sense that is not obsolete', () => {
    const went = [{ ...sense('A course; a way, a path.'), pos: 'noun', register: 'obsolete' }, sense('simple past of go')]
    expect(lemmaFromSenses(went, 'went')).toBe('go')
  })

  it('ignores a pointer after sense 15', () => {
    const run = [...Array.from({ length: 117 }, () => sense('To move swiftly.')), sense('past participle of rin')]
    expect(lemmaFromSenses(run, 'run')).toBeNull()
    const saw = [...Array.from({ length: 14 }, () => sense('A tool for cutting.')), sense('simple past of see')]
    expect(lemmaFromSenses(saw, 'saw')).toBe('see')
  })
})

describe('pointerLemma', () => {
  it('reads the word a pointer or a heading names', () => {
    expect(pointerLemma('inflection of casar:')).toBe('casar')
    expect(pointerLemma('plural of person')).toBe('person')
  })

  it('leaves prose alone', () => {
    expect(pointerLemma('A form of government.')).toBeNull()
    expect(pointerLemma(null)).toBeNull()
  })
})

describe('pointerLemma limits', () => {
  it('needs a grammar word before "of", not only a label', () => {
    expect(pointerLemma('(idiom) of long standing; with a long history')).toBeNull()
    expect(pointerLemma('(coll.) of poor quality', 3)).toBeNull()
    expect(pointerLemma('(obsolete) plural of cow')).toBe('cow')
  })

  it('applies the limits of lemmaFromSenses', () => {
    expect(pointerLemma('Alternative form of gyve.', 29)).toBeNull()
    expect(pointerLemma('Alternative form of gyve.', 3)).toBeNull()
    expect(pointerLemma('Misspelling of advise.', 0)).toBe('advise')
    expect(pointerLemma('simple past of see', 14)).toBe('see')
    expect(pointerLemma('past participle of rin', 15)).toBeNull()
  })
})

describe('formLineLemma', () => {
  const casa: DictSense[] = [
    { pos: 'noun', glossVi: null, glossEn: 'house', senseOrder: 1 },
    { pos: 'verb', glossVi: null, glossEn: 'inflection of casar:', senseOrder: 2 },
    { pos: 'verb', glossVi: null, glossEn: 'third-person singular present indicative', senseOrder: 3 },
    { pos: 'verb', glossVi: null, glossEn: 'second-person singular (tú) affirmative imperative', senseOrder: 4 },
  ]

  it('gives the lines under a heading the heading lemma', () => {
    expect([0, 1, 2, 3].map((i) => formLineLemma(casa, i))).toEqual([null, null, 'casar', 'casar'])
  })

  it('needs the heading in the same part of speech', () => {
    const noun = casa.map((s, i) => (i === 2 ? { ...s, pos: 'noun' } : s))
    expect(formLineLemma(noun, 2)).toBeNull()
    expect(formLineLemma([casa[2]], 0)).toBeNull()
  })

  it('leaves a definition alone', () => {
    expect(formLineLemma([casa[1], { ...casa[2], glossEn: 'A form of government.' }], 1)).toBeNull()
  })
})
