import { describe, it, expect } from 'vitest'
import { LANGUAGES, LANG_CODES, byLang, getLanguage, isLangCode, speechLang } from '@/lib/languages'
import { LANG_LABELS } from '@/lib/dictionary/labels'

describe('speechLang', () => {
  it('maps lang codes to BCP-47', () => {
    expect(speechLang('en')).toBe('en-US')
    expect(speechLang('es')).toBe('es-ES')
    expect(speechLang('zh')).toBe('zh-CN')
  })
})

describe('isLangCode / getLanguage', () => {
  it('accepts the three supported codes and nothing else', () => {
    expect(isLangCode('en')).toBe(true)
    expect(isLangCode('zh')).toBe(true)
    expect(isLangCode('fr')).toBe(false)
    expect(isLangCode('')).toBe(false)
  })
  it('looks a language up by code', () => {
    expect(getLanguage('zh')?.nativeName).toBe('中文')
    expect(getLanguage('fr')).toBeUndefined()
  })
})

describe('byLang', () => {
  it('builds a value for every language, keyed by code', () => {
    expect(byLang((l) => l.nativeName)).toEqual({ en: 'English', es: 'Español', zh: '中文' })
  })

  // The point of deriving these: a language added to LANGUAGES must not leave a
  // label or a flag behind in a file someone forgot to open.
  it('leaves no language without a label', () => {
    for (const code of LANG_CODES) {
      expect(LANG_LABELS[code]).toBeTruthy()
    }
    expect(Object.keys(LANG_LABELS)).toHaveLength(LANGUAGES.length)
  })

  it('takes its labels from LANGUAGES rather than a second copy', () => {
    for (const language of LANGUAGES) {
      expect(LANG_LABELS[language.code]).toBe(language.name)
    }
  })
})
