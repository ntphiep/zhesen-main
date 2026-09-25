import { describe, it, expect } from 'vitest'
import { splitIpa } from '@/lib/theory/ipa'

const SYMBOLS = ['iː', 'ɪ', 'θ', 'ŋ', 'tʃ', 't', 'ʃ', 'e', 'eɪ']

describe('splitIpa', () => {
  it('keeps the slashes and the stress mark as plain text', () => {
    expect(splitIpa('/ˈθɪŋ/', SYMBOLS)).toEqual([
      { text: '/ˈ', symbol: null },
      { text: 'θ', symbol: 'θ' },
      { text: 'ɪ', symbol: 'ɪ' },
      { text: 'ŋ', symbol: 'ŋ' },
      { text: '/', symbol: null },
    ])
  })

  it('takes the longest symbol first, so tʃ is one sound and not two', () => {
    expect(splitIpa('tʃ', SYMBOLS)).toEqual([{ text: 'tʃ', symbol: 'tʃ' }])
  })

  it('does not split a length mark off its vowel', () => {
    expect(splitIpa('iː', SYMBOLS)).toEqual([{ text: 'iː', symbol: 'iː' }])
  })

  it('reads eɪ as the diphthong rather than e then a stray mark', () => {
    expect(splitIpa('eɪ', SYMBOLS)).toEqual([{ text: 'eɪ', symbol: 'eɪ' }])
  })

  it('returns one plain token when nothing is known', () => {
    expect(splitIpa('ni hǎo', [])).toEqual([{ text: 'ni hǎo', symbol: null }])
  })

  it('answers an empty list for an empty string', () => {
    expect(splitIpa('', SYMBOLS)).toEqual([])
  })
})
