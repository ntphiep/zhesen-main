import { describe, it, expect } from 'vitest'
import { checkTypedAnswer } from '@/lib/wordlist/typing'

describe('checkTypedAnswer', () => {
  it('accepts exact answers ignoring case, surrounding/extra spaces and diacritics', () => {
    expect(checkTypedAnswer('Dog ', 'dog')).toBe('correct')
    expect(checkTypedAnswer('the   dog', 'the dog')).toBe('correct')
    expect(checkTypedAnswer('café', 'cafe')).toBe('correct')
  })
  it('flags a single-character typo as "close" for words long enough', () => {
    expect(checkTypedAnswer('davelop', 'develop')).toBe('close') // 1 substitution
    expect(checkTypedAnswer('developp', 'develop')).toBe('close') // 1 insertion
  })
  it('does not treat short words leniently', () => {
    expect(checkTypedAnswer('cot', 'cat')).toBe('wrong')
  })
  it('rejects clearly different or empty answers', () => {
    expect(checkTypedAnswer('cat', 'develop')).toBe('wrong')
    expect(checkTypedAnswer('', 'dog')).toBe('wrong')
  })
})
