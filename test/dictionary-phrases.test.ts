import { describe, it, expect } from 'vitest'
import { phraseCandidates, phrasalTail, pickPhrases } from '@/lib/dictionary/phrases'
import { tokenize } from '@/lib/reader/tokenize'
import type { DictEntryPreview } from '@/lib/dictionary/types'

const entry = (headword: string): DictEntryPreview => ({
  id: `en:${headword}`, lang: 'en', headword, traditional: null, level: null,
  ipa: null, pos: 'verb', glossVi: 'nghĩa', glossEn: null, audioUrl: null,
})

const keys = (text: string) => phraseCandidates(tokenize('en', text)).map((c) => c.key)

describe('phraseCandidates', () => {
  it('asks for every run of two to six words, lowercased', () => {
    const k = keys('I Gave up smoking')
    expect(k).toContain('gave up')
    expect(k).toContain('i gave up smoking')
    expect(k).not.toContain('smoking')
  })

  it('never joins two words across punctuation', () => {
    expect(keys('I gave up. Smoking kills')).not.toContain('up smoking')
    expect(keys('I gave up. Smoking kills')).toContain('gave up')
  })

  it('skips a run made only of function words', () => {
    expect(keys('out of the box')).not.toContain('of the')
    expect(keys('out of the box')).toContain('the box')
  })

  it('asks for a separable verb without its pronoun object', () => {
    const found = phraseCandidates(tokenize('en', 'She gave it up'))
    expect(found).toContainEqual({ key: 'gave up', text: 'gave it up', first: 1, last: 3 })
  })

  // "Can you tell me how to get to the station?" showed the idiom you tell me, "I don't know".
  it('starts no phrase on the subject of a question', () => {
    expect(keys('Can you tell me how to get there')).not.toContain('you tell me')
    expect(keys('Can you tell me how to get there')).not.toContain('can you')
    expect(keys('Can you tell me how to get there')).toContain('tell me')
    expect(keys('Well, you tell me')).toContain('you tell me')
  })

  it('stops at six words', () => {
    expect(keys('at the end of the day we went home').some((k) => k.split(' ').length > 6)).toBe(false)
    expect(keys('at the end of the day')).toContain('at the end of the day')
  })
})

describe('pickPhrases', () => {
  it('keeps the multi-word entries in reading order, as written', () => {
    const segments = tokenize('en', 'She gave up and looked forward to it')
    const found = new Map([['gave up', entry('give up')], ['looked forward to', entry('look forward to')]])
    expect(pickPhrases(phraseCandidates(segments), found)).toEqual([
      { text: 'gave up', entry: entry('give up') },
      { text: 'looked forward to', entry: entry('look forward to') },
    ])
  })

  it('prefers the longer of two overlapping phrases', () => {
    const segments = tokenize('en', 'we look forward to it')
    const found = new Map([['look forward', entry('look forward')], ['look forward to', entry('look forward to')]])
    expect(pickPhrases(phraseCandidates(segments), found).map((p) => p.entry.headword)).toEqual(['look forward to'])
  })

  it('drops a candidate the dictionary answered with a single word', () => {
    const segments = tokenize('en', 'can not')
    expect(pickPhrases(phraseCandidates(segments), new Map([['can not', entry('cannot')]]))).toEqual([])
  })

  // want to and play in showed English pointers with no Vietnamese meaning.
  it('drops an entry with no Vietnamese meaning and a sum-of-parts entry', () => {
    const segments = tokenize('en', 'I want to play in the garden')
    const found = new Map([
      ['want to', { ...entry('want to'), glossVi: null }],
      ['play in', { ...entry('play in'), glossEn: 'Used other than figuratively or idiomatically: see play, in.' }],
    ])
    expect(pickPhrases(phraseCandidates(segments), found)).toEqual([])
  })

  it('lists an entry once however often the passage repeats it', () => {
    const segments = tokenize('en', 'give up, then give up again')
    expect(pickPhrases(phraseCandidates(segments), new Map([['give up', entry('give up')]]))).toHaveLength(1)
  })
})

describe('phrasalTail', () => {
  it('is the particles after the verb, one or two of them', () => {
    expect(phrasalTail('take', 'take off')).toBe('off')
    expect(phrasalTail('look', 'look forward to')).toBe('forward to')
    expect(phrasalTail('put', 'put up with')).toBe('up with')
  })

  it('is null for an idiom, a longer phrase or another verb', () => {
    expect(phrasalTail('take', 'take care')).toBeNull()
    expect(phrasalTail('get', 'get rid of')).toBeNull()
    expect(phrasalTail('take', 'take up with it')).toBeNull()
    expect(phrasalTail('give', 'forgive up')).toBeNull()
  })
})
