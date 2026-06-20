import { describe, it, expect } from 'vitest'
import { detectOrder } from '@/lib/dictionary/detect'

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
