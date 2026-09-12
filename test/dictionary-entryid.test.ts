import { describe, it, expect } from 'vitest'
import { splitEntryId, buildEntryId, entryPath, searchPath } from '@/lib/dictionary/entryId'
import { relationLabel, LANG_LABELS } from '@/lib/dictionary/labels'

describe('entryId helpers', () => {
  it('splits at the first colon only', () => {
    expect(splitEntryId('en:dog')).toEqual({ lang: 'en', key: 'dog' })
    expect(splitEntryId('es:Internet Movie Database')).toEqual({ lang: 'es', key: 'Internet Movie Database' })
    expect(splitEntryId('zh:狗')).toEqual({ lang: 'zh', key: '狗' })
  })
  it('builds an entry id', () => {
    expect(buildEntryId('zh', '狗')).toBe('zh:狗')
  })
  it('encodes the detail path', () => {
    expect(entryPath('en:dog')).toBe('/dictionary/en/dog')
    expect(entryPath('zh:狗')).toBe('/dictionary/zh/%E7%8B%97')
    expect(entryPath('es:Internet Movie Database')).toBe('/dictionary/es/Internet%20Movie%20Database')
  })
  it('builds a re-search path', () => {
    expect(searchPath('en', 'hound')).toBe('/dictionary?q=hound&lang=en')
    expect(searchPath('zh', '小狗')).toBe('/dictionary?q=%E5%B0%8F%E7%8B%97&lang=zh')
  })
})

describe('labels', () => {
  it('maps relation types to Vietnamese, falls back to raw', () => {
    expect(relationLabel('synonym')).toBe('Cận nghĩa')
    expect(relationLabel('antonym')).toBe('Trái nghĩa')
    expect(relationLabel('derived')).toBe('Phái sinh')
    expect(relationLabel('related')).toBe('Liên quan')
    expect(relationLabel('weird')).toBe('weird')
  })
  it('has a label and flag for every lang', () => {
    expect(LANG_LABELS.zh).toBe('Tiếng Trung')
  })
})
