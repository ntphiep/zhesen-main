import { describe, it, expect } from 'vitest'
import { detectOrder, orderByBestMatch } from '@/lib/dictionary/detect'
import type { DictEntryPreview } from '@/lib/dictionary/types'
import type { LangCode } from '@/lib/languages'

const hit = (lang: LangCode, headword: string, matchScore: number): DictEntryPreview => ({
  id: `${lang}:${headword}`, lang, headword, traditional: null, level: null,
  ipa: null, pos: null, glossVi: null, glossEn: null, audioUrl: null, matchScore,
})

describe('orderByBestMatch', () => {
  it('puts the language that actually matched first', () => {
    // "corriendo" is Latin script, so the heuristic guesses English; the English
    // hits are trigram guesses under 1.0 and the Spanish one is the real answer.
    const forward = {
      en: [hit('en', 'corridor', 0.92), hit('en', 'condo', 0.9)],
      es: [hit('es', 'correr', 3.51)],
      zh: [],
    }
    expect(orderByBestMatch(detectOrder('corriendo'), forward)).toEqual(['es', 'en', 'zh'])
  })

  it('keeps the heuristic order when the best matches are equally good', () => {
    const forward = { en: [hit('en', 'no', 4.0)], es: [hit('es', 'no', 4.0)], zh: [] }
    expect(orderByBestMatch(detectOrder('no'), forward)).toEqual(['en', 'es', 'zh'])
  })

  it('weighs the reverse lookup alongside the forward one', () => {
    const forward = { en: [hit('en', 'an', 1.1)], es: [], zh: [] }
    const reverse = { en: [], es: [], zh: [hit('zh', '吃', 5.0)] }
    expect(orderByBestMatch(detectOrder('ăn'), forward, reverse)).toEqual(['zh', 'en', 'es'])
  })

  it('leaves the order alone when nothing carries a score', () => {
    const forward = {
      en: [{ ...hit('en', 'a', 0), matchScore: undefined }],
      es: [], zh: [],
    }
    expect(orderByBestMatch(detectOrder('a'), forward)).toEqual(['en', 'es', 'zh'])
  })

  it('handles empty groups', () => {
    expect(orderByBestMatch(detectOrder('学'), { en: [], es: [], zh: [] })).toEqual(['zh', 'en', 'es'])
    expect(orderByBestMatch(detectOrder('niño'))).toEqual(['es', 'en', 'zh'])
  })
})
