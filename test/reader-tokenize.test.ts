import { describe, it, expect } from 'vitest'
import { tokenizeLatin, tokenizeHan, tokenize } from '@/lib/reader/tokenize'

const join = (segs: { text: string }[]) => segs.map((s) => s.text).join('')
const words = (segs: { text: string; word: boolean }[]) => segs.filter((s) => s.word).map((s) => s.text)

describe('tokenizeLatin', () => {
  it('splits words from whitespace and keeps gaps', () => {
    const segs = tokenizeLatin('the dog')
    expect(segs).toEqual([
      { text: 'the', word: true },
      { text: ' ', word: false },
      { text: 'dog', word: true },
    ])
  })

  it('keeps internal apostrophes and hyphens inside a word', () => {
    expect(words(tokenizeLatin("don't well-being"))).toEqual(["don't", 'well-being'])
  })

  it('treats punctuation as gaps, not part of the word', () => {
    expect(words(tokenizeLatin('Hello, world!'))).toEqual(['Hello', 'world'])
  })

  it('handles accented Spanish letters as word characters', () => {
    expect(words(tokenizeLatin('el niño corrió'))).toEqual(['el', 'niño', 'corrió'])
  })

  it('returns [] for empty input and is loss-less', () => {
    expect(tokenizeLatin('')).toEqual([])
    const original = '  Hey,  you?  '
    expect(join(tokenizeLatin(original))).toBe(original)
  })
})

describe('tokenizeHan', () => {
  it('greedily matches the longest dictionary headword', () => {
    expect(tokenizeHan('你好', ['好', '你好'])).toEqual([{ text: '你好', word: true }])
  })

  it('falls back to single Han characters when no headword matches', () => {
    const segs = tokenizeHan('你好吗', ['你好'])
    expect(words(segs)).toEqual(['你好', '吗'])
    expect(join(segs)).toBe('你好吗')
  })

  it('keeps non-Han runs as gaps and stays loss-less', () => {
    const segs = tokenizeHan('你好，世界', ['你好', '世界'])
    expect(segs).toEqual([
      { text: '你好', word: true },
      { text: '，', word: false },
      { text: '世界', word: true },
    ])
    expect(join(segs)).toBe('你好，世界')
  })

  it('treats latin letters in zh text as gaps', () => {
    expect(tokenizeHan('a你', ['你'])).toEqual([
      { text: 'a', word: false },
      { text: '你', word: true },
    ])
  })
})

describe('tokenize', () => {
  it('dispatches latin for en/es and han for zh', () => {
    expect(tokenize('en', 'the dog')).toEqual(tokenizeLatin('the dog'))
    expect(tokenize('zh', '你好', ['你好'])).toEqual(tokenizeHan('你好', ['你好']))
  })
})
