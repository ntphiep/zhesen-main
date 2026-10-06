import { describe, expect, it } from 'vitest'
import { clozeForms, findGap } from '@/lib/practice/cloze'
import { pickFormQuestion } from '@/lib/practice/forms'
import { buildPhraseGap, gapSlot, rivalPhrases } from '@/lib/practice/phraseGap'
import { gradeForMode, MODE_SKILL } from '@/lib/practice/grading'

const first = () => 0

describe('findGap', () => {
  it('cuts out the inflected form a sentence uses', () => {
    const forms = clozeForms('give up', 'en', ['gave up', 'given up'])
    const gap = findGap([{ text: 'She gave up smoking last year.', translationVi: 'Cô ấy bỏ thuốc năm ngoái.' }], forms, 'en')
    expect(gap).toEqual({ before: 'She ', answer: 'gave up', after: ' smoking last year.', translationVi: 'Cô ấy bỏ thuốc năm ngoái.' })
  })

  it('finds a regular form the source does not list, as a whole word only', () => {
    const forms = clozeForms('decide', 'en', [])
    expect(findGap([{ text: 'They are deciding now.', translationVi: null }], forms, 'en')?.answer).toBe('deciding')
    expect(findGap([{ text: 'An undecided vote.', translationVi: null }], forms, 'en')).toBeNull()
  })

  it('reads an idiom placeholder as the word a sentence puts there', () => {
    const forms = clozeForms("make up one's mind", 'en', ["made up one's mind"])
    expect(findGap([{ text: 'She finally made up her mind.', translationVi: null }], forms, 'en')?.answer).toBe('made up her mind')
  })

  it('skips a sentence that is only the word, or too long to read at a glance', () => {
    const forms = clozeForms('hello', 'en', [])
    expect(findGap([{ text: 'Hello!', translationVi: null }], forms, 'en')).toBeNull()
    expect(findGap([{ text: `hello ${'and more words '.repeat(12)}`, translationVi: null }], forms, 'en')).toBeNull()
  })

  it('finds a Chinese word inside its sentence', () => {
    expect(findGap([{ text: '我每天学习中文。', translationVi: null }], ['学习'], 'zh')).toMatchObject({ before: '我每天', answer: '学习', after: '中文。' })
  })
})

describe('pickFormQuestion', () => {
  const go = [
    { text: 'goes', label: 'present singular third-person' },
    { text: 'went', label: 'past' },
    { text: 'goeth', label: 'archaic present singular third-person' },
  ]

  it('asks for an irregular form before a regular one, and never an archaic one', () => {
    expect(pickFormQuestion('go', go, first)).toEqual({ cue: 'quá khứ đơn', answers: ['went'], irregular: true })
  })

  it('takes every spelling of the form', () => {
    const learn = [{ text: 'learned', label: 'past' }, { text: 'learnt', label: 'past' }]
    expect(pickFormQuestion('learn', learn, first)?.answers).toEqual(['learned', 'learnt'])
  })

  it('asks nothing of a phrase or of a word without forms', () => {
    expect(pickFormQuestion('give up', [{ text: 'gave up', label: 'past' }], first)).toBeNull()
    expect(pickFormQuestion('the', [], first)).toBeNull()
  })
})

describe('buildPhraseGap', () => {
  it('blanks the particle of a phrasal verb and never offers one that makes another phrasal verb', () => {
    const existing = new Set(['give in', 'give out', 'give away', 'give back', 'give off'])
    const gap = buildPhraseGap({ headword: 'give up', kind: 'phrasal_verb' }, existing, first)
    expect(gap).toMatchObject({ before: 'give', answer: 'up', after: '' })
    expect(gap!.options).toHaveLength(4)
    expect(gap!.options.filter((o) => existing.has(`give ${o}`))).toEqual([])
  })

  it('blanks the light verb of a collocation and the preposition of an idiom', () => {
    expect(gapSlot('make a decision', 'phrase')).toMatchObject({ at: 0 })
    expect(gapSlot('on the spot', 'idiom')).toMatchObject({ at: 0 })
    expect(gapSlot('heavy rain', 'collocation')).toBeNull()
  })

  it('lists the rival phrases to look up', () => {
    expect(rivalPhrases('on the spot', 'idiom')).toContain('in the spot')
  })
})

describe('the new modes on the schedule', () => {
  it('grades recall by producing the word and recognition by choosing it', () => {
    expect([MODE_SKILL.cloze, MODE_SKILL.ipa, MODE_SKILL.forms]).toEqual(['recall', 'recall', 'recall'])
    expect([MODE_SKILL.listen, MODE_SKILL.phrase]).toEqual(['recognition', 'recognition'])
    expect(gradeForMode('cloze', { correct: true, nearly: true })).toBe('hard')
    expect(gradeForMode('phrase', { correct: false })).toBe('again')
  })
})
