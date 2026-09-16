import { describe, it, expect } from 'vitest'
import { detectOrder, looksHan, looksVietnamese } from '@/lib/dictionary/detect'

describe('detectOrder', () => {
  it('puts Chinese first when Han script is present', () => {
    expect(detectOrder('你好')[0]).toBe('zh')
    expect(detectOrder('中文')[0]).toBe('zh')
  })
  it('puts Spanish first for Spanish-specific letters/punctuation', () => {
    expect(detectOrder('niño')[0]).toBe('es')
    expect(detectOrder('canción')[0]).toBe('es')
    expect(detectOrder('¿cómo?')[0]).toBe('es')
  })
  it('defaults to English first for plain Latin', () => {
    expect(detectOrder('dog')).toEqual(['en', 'es', 'zh'])
    expect(detectOrder('')).toEqual(['en', 'es', 'zh'])
  })
  it('always returns all three languages', () => {
    expect([...detectOrder('你好')].sort()).toEqual(['en', 'es', 'zh'])
  })
})

describe('looksVietnamese', () => {
  it('detects Vietnamese-exclusive diacritics', () => {
    expect(looksVietnamese('nhận được')).toBe(true)
    expect(looksVietnamese('đi học')).toBe(true)
    expect(looksVietnamese('cảm ơn')).toBe(true)
    expect(looksVietnamese('ăn cơm')).toBe(true)
  })
  it('does not flag plain Latin, English, or Spanish text (including a-with-accent shared with other languages)', () => {
    expect(looksVietnamese('dog')).toBe(false)
    expect(looksVietnamese('nhan duoc')).toBe(false)
    expect(looksVietnamese('canción')).toBe(false)
    expect(looksVietnamese('niño')).toBe(false)
    // "xin chào" has only a plain grave-accented vowel (shared with French/Italian),
    // no Vietnamese-exclusive mark -- relies on searchBothDirections' forward-miss
    // fallback instead, see lib/dictionary/search.ts.
    expect(looksVietnamese('xin chào')).toBe(false)
  })
})

describe('looksHan', () => {
  it('recognises simplified, traditional and mixed queries', () => {
    expect(looksHan('狗')).toBe(true)
    expect(looksHan('習')).toBe(true)
    expect(looksHan('学习')).toBe(true)
    expect(looksHan('HSK 汉字')).toBe(true)
  })

  it('leaves every Latin-script query alone, including Vietnamese', () => {
    expect(looksHan('dog')).toBe(false)
    expect(looksHan('nhận được')).toBe(false)
    expect(looksHan('canción')).toBe(false)
    expect(looksHan('xue xi')).toBe(false)
  })
})
