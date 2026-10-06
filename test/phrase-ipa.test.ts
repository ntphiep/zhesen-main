import { describe, expect, it } from 'vitest'
import { composePhraseIpa, isPhrasalVerb } from '@/lib/dictionary/phraseIpa'
import type { DictPron } from '@/lib/dictionary/types'

const uk = (ipa: string): DictPron => ({ accent: 'en-UK', ipa, audioUrl: null })
const us = (ipa: string): DictPron => ({ accent: 'en-US', ipa, audioUrl: null })
const any = (ipa: string): DictPron => ({ accent: 'en', ipa, audioUrl: null })

const PRONS = new Map<string, DictPron[]>([
  ['spot', [uk('/spɒt/'), us('/spɑt/')]],
  // As stored: a UK row that is only a recording, its transcription on an unlabeled row.
  ['give', [{ accent: 'en-UK', ipa: null, audioUrl: null }, any('/ˈɡɪv/'), us('/ɡɪv/')]],
  ['up', [uk('/ʌp/'), us('/ʌp/')]],
  ['look', [uk('/lʊk/'), us('/lʊk/')]],
  ['forward', [uk('/ˈfɔːwəd/'), us('/ˈfɔɹwəɹd/')]],
  ['break', [uk('/bɹeɪk/'), us('/bɹeɪk/')]],
  ['ice', [uk('/aɪs/'), us('/aɪs/')]],
  ['out', [uk('/ˈäʊ̯t/'), uk('/aʊt/'), us('/ˈaʊ̯t/')]],
  ['heavy', [uk('/ˈhɛvi/')]],
  ['rain', [uk('/ɹeɪn/'), us('/ɹeɪn/')]],
])

describe('composePhraseIpa', () => {
  it('weakens the article and stresses the content word', () => {
    expect(composePhraseIpa('on the spot', PRONS, false)).toEqual({ uk: '/ɒn ðə ˈspɒt/', us: '/ɑn ðə ˈspɑt/' })
  })

  it('stresses a phrasal verb on its particle', () => {
    expect(composePhraseIpa('give up', PRONS, true)).toEqual({ uk: '/ˌɡɪv ˈʌp/', us: '/ˌɡɪv ˈʌp/' })
  })

  it('keeps a final preposition strong', () => {
    expect(composePhraseIpa('look forward to', PRONS, true).uk).toBe('/ˌlʊk ˈfɔːwəd tuː/')
  })

  it('writes the before a vowel as ði', () => {
    expect(composePhraseIpa('break the ice', PRONS, true).uk).toBe('/ˈbɹeɪk ði ˈaɪs/')
  })

  it('prefers a standard transcription and drops the diphthong mark', () => {
    expect(composePhraseIpa('look out', PRONS, true)).toEqual({ uk: '/ˌlʊk ˈaʊt/', us: '/ˌlʊk ˈaʊt/' })
  })

  it('gives no accent where a word has no transcription in it', () => {
    expect(composePhraseIpa('heavy rain', PRONS, false)).toEqual({ uk: '/ˈhɛvi ˈɹeɪn/', us: null })
  })

  it('composes nothing for one word or for a word it cannot read', () => {
    expect(composePhraseIpa('spot', PRONS, false)).toEqual({ uk: null, us: null })
    expect(composePhraseIpa('on the spot!', PRONS, false)).toEqual({ uk: null, us: null })
    expect(composePhraseIpa('on the moon', PRONS, false)).toEqual({ uk: null, us: null })
  })
})

describe('isPhrasalVerb', () => {
  it('takes a verb with one or two particles', () => {
    expect(isPhrasalVerb(['put', 'up', 'with'], true)).toBe(true)
    expect(isPhrasalVerb(['make', 'a', 'decision'], true)).toBe(false)
    expect(isPhrasalVerb(['give', 'up'], false)).toBe(false)
  })
})
