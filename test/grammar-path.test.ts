import { describe, it, expect } from 'vitest'
import { splitGrammarPointId, buildGrammarPointId, grammarPointPath, grammarLangPath } from '@/lib/grammar/path'

describe('splitGrammarPointId / buildGrammarPointId', () => {
  it('round-trips a lang + multi-part key', () => {
    const { lang, key } = splitGrammarPointId('zh:hsk3:cau-chu-ba-co-ban')
    expect(lang).toBe('zh')
    expect(key).toBe('hsk3:cau-chu-ba-co-ban')
    expect(buildGrammarPointId('zh', key)).toBe('zh:hsk3:cau-chu-ba-co-ban')
  })
})

describe('grammarPointPath', () => {
  it('encodes the colon-bearing key into the URL segment', () => {
    expect(grammarPointPath('zh:hsk3:cau-chu-ba-co-ban')).toBe('/theory/zh/grammar/hsk3%3Acau-chu-ba-co-ban')
  })
})

describe('grammarLangPath', () => {
  it('builds the per-language grammar overview path', () => {
    expect(grammarLangPath('en')).toBe('/theory/en/grammar')
  })
})
