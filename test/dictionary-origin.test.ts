import { describe, it, expect } from 'vitest'
import { grammarLabels, kindLine, langLabel, originPosLabel, shownOrigins } from '@/lib/dictionary/origin'
import type { Origin } from '@/lib/dictionary/types'

describe('langLabel', () => {
  it('names a known language in Vietnamese and falls back to the English name', () => {
    expect(langLabel({ lang: 'enm', name: 'Middle English' })).toBe('tiếng Anh trung đại')
    expect(langLabel({ lang: 'xcl', name: 'Old Armenian' })).toBe('Old Armenian')
    expect(langLabel({ lang: 'constructor' })).toBe('constructor')
  })
})

describe('kindLine', () => {
  it('says how the word was made and from what', () => {
    expect(kindLine({ type: 'clipping', word: 'concatenate', e: true })).toEqual({ text: 'Rút gọn từ', word: 'concatenate', linked: true })
    expect(kindLine({ type: 'onomatopoeia' })).toEqual({ text: 'Từ tượng thanh' })
    expect(kindLine({ type: 'coinage', by: 'Robert A. Heinlein', year: '1961' }).text).toBe('Robert A. Heinlein đặt ra năm 1961')
  })
})

const noun: Origin = { pos: ['noun'], chain: [{ rel: 'inh', lang: 'enm', word: 'bok' }] }
const verb: Origin = { pos: ['verb'], chain: [{ rel: 'inh', lang: 'enm', word: 'booken' }] }

describe('shownOrigins', () => {
  it('puts the etymology of the leading part of speech first', () => {
    expect(shownOrigins({ origins: [noun, verb] }, 'verb')).toEqual([verb, noun])
    expect(shownOrigins({ origins: [noun, verb] }, 'adj')).toEqual([noun, verb])
  })

  it('shows at most three', () => {
    expect(shownOrigins({ origins: [noun, verb, noun, verb] }, 'noun')).toHaveLength(3)
    expect(shownOrigins(null, 'noun')).toEqual([])
  })
})

describe('originPosLabel', () => {
  it('names each part of speech once', () => {
    expect(originPosLabel({ pos: ['noun', 'verb', 'noun'], chain: [] })).toBe('danh từ, động từ')
  })
})

describe('grammarLabels', () => {
  const notes = {
    senseGrammar: {
      'en:a#1': ['countable', 'uncountable'],
      'en:a#2': ['transitive', 'with to'],
      'en:a#3': ['intransitive'],
      'en:a#4': ['not-comparable', 'negative'],
    },
  }

  it('says a pair Wiktionary tags separately once', () => {
    expect(grammarLabels(notes, ['en:a#1'])).toEqual(['đếm được và không đếm được'])
    expect(grammarLabels(notes, ['en:a#2', 'en:a#3'])).toEqual(['nội và ngoại động từ', 'đi với to'])
  })

  it('labels the rest in Vietnamese and ignores unknown ids', () => {
    expect(grammarLabels(notes, ['en:a#4', 'en:zz', undefined])).toEqual(['không so sánh', 'thường ở câu phủ định'])
    expect(grammarLabels(null, ['en:a#1'])).toEqual([])
  })

  it('says a label two tags share once', () => {
    const tagged = { senseGrammar: { a: ['with the', 'with-definite-article'], b: ['ergative', 'transitive'], c: ['predicative'] } }
    expect(grammarLabels(tagged, ['a'])).toEqual(['đi với the'])
    expect(grammarLabels(tagged, ['b'])).toEqual(['nội và ngoại động từ'])
    expect(grammarLabels(tagged, ['c'])).toEqual(['đứng sau động từ nối'])
  })
})
