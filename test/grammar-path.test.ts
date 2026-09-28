import { describe, it, expect } from 'vitest'
import { splitGrammarPointId, buildGrammarPointId, grammarPointPath, grammarLangPath, grammarKeyFromPath } from '@/lib/grammar/path'

describe('splitGrammarPointId / buildGrammarPointId', () => {
  it('round-trips a lang + multi-part key', () => {
    const { lang, key } = splitGrammarPointId('zh:hsk3:cau-chu-ba-co-ban')
    expect(lang).toBe('zh')
    expect(key).toBe('hsk3:cau-chu-ba-co-ban')
    expect(buildGrammarPointId('zh', key)).toBe('zh:hsk3:cau-chu-ba-co-ban')
  })
})

describe('grammarPointPath', () => {
  // A colon is not legal in a Windows file name, and Next writes the segment into
  // the prerender cache file name (#25).
  it('writes the key without a colon', () => {
    expect(grammarPointPath('zh:hsk3:cau-chu-ba-co-ban')).toBe('/theory/zh/grammar/hsk3_cau-chu-ba-co-ban')
    expect(grammarPointPath('en:a1:cau-hoi-wh-questions')).toBe('/theory/en/grammar/a1_cau-hoi-wh-questions')
  })
})

describe('grammarKeyFromPath', () => {
  it('reads the key back from the segment grammarPointPath writes', () => {
    const segment = grammarPointPath('zh:hsk3:cau-chu-ba-co-ban').split('/').pop()!
    expect(buildGrammarPointId('zh', grammarKeyFromPath(segment))).toBe('zh:hsk3:cau-chu-ba-co-ban')
  })
  it('still reads the colon forms of the old URLs', () => {
    expect(grammarKeyFromPath('hsk3:cau-chu-ba-co-ban')).toBe('hsk3:cau-chu-ba-co-ban')
    expect(grammarKeyFromPath('hsk3%3Acau-chu-ba-co-ban')).toBe('hsk3:cau-chu-ba-co-ban')
  })
})

describe('grammarLangPath', () => {
  it('builds the per-language grammar overview path', () => {
    expect(grammarLangPath('en')).toBe('/theory/en/grammar')
  })
})
