import { describe, it, expect } from 'vitest'
import { checkTypedAnswer } from '@/lib/practice/typing'

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

// Owner decision 2026-10-05: a Spanish accent miss and a Chinese tone miss are "gần đúng",
// graded hard, not a clean recall.
describe('checkTypedAnswer with a language', () => {
  it('marks a Spanish answer that only misses an accent', () => {
    expect(checkTypedAnswer('ano', 'año', { lang: 'es' })).toBe('accent')
    expect(checkTypedAnswer('el', 'él', { lang: 'es' })).toBe('accent')
    expect(checkTypedAnswer('año', 'año', { lang: 'es' })).toBe('correct')
  })
  it('ignores accents when the caller folds them', () => {
    expect(checkTypedAnswer('ano', 'año', { lang: 'es', foldAccents: true })).toBe('correct')
  })
  it('accepts Chinese characters, the traditional form and toned pinyin', () => {
    const opts = { lang: 'zh' as const, accepted: ['xué xí', '學習'] }
    expect(checkTypedAnswer('学习', '学习', opts)).toBe('correct')
    expect(checkTypedAnswer('學習', '学习', opts)).toBe('correct')
    expect(checkTypedAnswer('xué xí', '学习', opts)).toBe('correct')
    expect(checkTypedAnswer('xuéxí', '学习', opts)).toBe('correct')
    expect(checkTypedAnswer('xue2xi2', '学习', opts)).toBe('correct')
    expect(checkTypedAnswer('lv4', '绿', { lang: 'zh', accepted: ['lǜ'] })).toBe('correct')
  })
  it('marks toneless or wrongly toned pinyin', () => {
    const opts = { lang: 'zh' as const, accepted: ['xué xí', '學習'] }
    expect(checkTypedAnswer('xuexi', '学习', opts)).toBe('accent')
    expect(checkTypedAnswer('xuě xì', '学习', opts)).toBe('accent')
    expect(checkTypedAnswer('xue3xi4', '学习', opts)).toBe('accent')
    expect(checkTypedAnswer('xuexue', '学习', opts)).toBe('wrong')
  })
  it('reads a curly apostrophe as a straight one', () => {
    expect(checkTypedAnswer('don’t', "don't", { lang: 'en' })).toBe('correct')
    expect(checkTypedAnswer('don’t', "don't")).toBe('correct')
  })
  it('keeps folding accents when no language is given', () => {
    expect(checkTypedAnswer('cafe', 'café')).toBe('correct')
    expect(checkTypedAnswer('cafe', 'café', { lang: 'en' })).toBe('correct')
  })
})
