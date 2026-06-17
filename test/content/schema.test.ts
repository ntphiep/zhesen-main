import { describe, it, expect } from 'vitest'
import { validateLanguages, validateLanguageContent } from '@/lib/content/schema'

const okLang = [{ code: 'zh', name: 'Tiếng Trung', nativeName: '中文', script: 'han' }]

const okContent = {
  lessons: [
    { id: 'zh-l1', lang: 'zh', title: 'Chào hỏi', description: '', position: 1, vocabIds: ['zh-1'] },
  ],
  vocab: [
    { id: 'zh-1', lang: 'zh', term: '你好', reading: 'nǐ hǎo', translation: { vi: 'xin chào' } },
  ],
}

describe('content schema', () => {
  it('accepts valid languages', () => {
    expect(validateLanguages(okLang)).toHaveLength(1)
  })
  it('accepts valid language content', () => {
    expect(validateLanguageContent(okContent).vocab[0].term).toBe('你好')
  })
  it('rejects an unknown lang code', () => {
    expect(() => validateLanguages([{ ...okLang[0], code: 'fr' }])).toThrow()
  })
  it('rejects vocab missing vi translation', () => {
    const bad = { ...okContent, vocab: [{ id: 'x', lang: 'zh', term: 'a', translation: {} }] }
    expect(() => validateLanguageContent(bad)).toThrow()
  })
})
