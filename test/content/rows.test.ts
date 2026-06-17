import { describe, it, expect } from 'vitest'
import { parseVocabRow, parseLanguageRow, parseLessonRow } from '@/lib/content/rows'

describe('content row schemas', () => {
  it('parses a vocab row (translation jsonb -> object)', () => {
    const v = parseVocabRow({ id: 'zh-1', lang: 'zh', term: '你好', reading: 'nǐ hǎo', translation: { vi: 'xin chào' }, part_of_speech: null, level: 'HSK1', examples: null, audio: null })
    expect(v).toMatchObject({ id: 'zh-1', lang: 'zh', term: '你好', reading: 'nǐ hǎo', translation: { vi: 'xin chào' }, level: 'HSK1' })
  })
  it('maps lesson row position and defaults', () => {
    expect(parseLessonRow({ id: 'zh-l1', lang: 'zh', title: 'Chào hỏi cơ bản', description: '', position: 1 }).position).toBe(1)
  })
  it('rejects a row missing translation.vi', () => {
    expect(() => parseVocabRow({ id: 'x', lang: 'zh', term: 'a', translation: {}, reading: null, part_of_speech: null, level: null, examples: null, audio: null })).toThrow()
  })
  it('rejects an unknown lang code', () => {
    expect(() => parseLanguageRow({ code: 'fr', name: 'x', native_name: 'y', script: 'latin' })).toThrow()
  })
  it('parses a vocab row with a valid example', () => {
    const v = parseVocabRow({ id: 'zh-1', lang: 'zh', term: '你好', reading: 'nǐ hǎo', translation: { vi: 'xin chào' }, part_of_speech: null, level: null, examples: [{ sentence: '你好！', reading: 'nǐ hǎo', translation: { vi: 'Xin chào!' } }], audio: null })
    expect(v.examples?.[0].sentence).toBe('你好！')
  })
  it('rejects a vocab row with a malformed example', () => {
    expect(() => parseVocabRow({ id: 'x', lang: 'zh', term: 'a', translation: { vi: 'b' }, reading: null, part_of_speech: null, level: null, examples: [{ reading: 'x' }], audio: null })).toThrow()
  })
})
