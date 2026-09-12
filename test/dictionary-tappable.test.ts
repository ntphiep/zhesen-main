import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DictEntryPreview } from '@/lib/dictionary/types'

const { resolveTokens, getZhSegmentCandidatesForTexts, getCharacters } = vi.hoisted(() => ({
  resolveTokens: vi.fn(async () => new Map<string, DictEntryPreview>()),
  getZhSegmentCandidatesForTexts: vi.fn(async () => [] as string[]),
  getCharacters: vi.fn(async () => []),
}))
vi.mock('@/lib/dictionary/resolveTokens', () => ({ resolveTokens, getZhSegmentCandidatesForTexts }))
vi.mock('@/lib/dictionary/entryDetail', () => ({ getCharacters }))

import { resolveTappableTexts } from '@/lib/dictionary/tappable'

const client = {} as SupabaseClient
const preview = (headword: string): DictEntryPreview => ({
  id: `en:${headword}`, lang: 'en', headword, traditional: null, level: null,
  ipa: null, pos: null, glossVi: 'nghĩa', glossEn: null, audioUrl: null,
})

beforeEach(() => vi.clearAllMocks())

describe('resolveTappableTexts', () => {
  // The whole point: one round trip for the page, not one chain per sentence.
  it('resolves every sentence with a single token lookup', async () => {
    resolveTokens.mockResolvedValueOnce(new Map([['dog', preview('dog')]]))
    const out = await resolveTappableTexts(client, 'en', ['a dog barks', 'the dog sleeps'])
    expect(resolveTokens).toHaveBeenCalledTimes(1)
    expect(out).toHaveLength(2)
  })

  it('gives each text only the entries its own tokens matched', async () => {
    resolveTokens.mockResolvedValueOnce(new Map([['dog', preview('dog')], ['cat', preview('cat')]]))
    const [first, second] = await resolveTappableTexts(client, 'en', ['a dog', 'a cat'])
    expect(first.entries.map(([token]) => token)).toEqual(['dog'])
    expect(second.entries.map(([token]) => token)).toEqual(['cat'])
  })

  it('keeps the sentence text so the renderer can pair them up', async () => {
    const out = await resolveTappableTexts(client, 'en', ['hello there'])
    expect(out[0].text).toBe('hello there')
    expect(out[0].segments.map((s) => s.text).join('')).toBe('hello there')
  })

  it('resolves a repeated sentence once', async () => {
    const out = await resolveTappableTexts(client, 'en', ['same', 'same'])
    expect(out).toHaveLength(1)
  })

  it('ignores blank input without querying anything', async () => {
    expect(await resolveTappableTexts(client, 'en', ['', '   '])).toEqual([])
    expect(resolveTokens).not.toHaveBeenCalled()
  })

  // Segmentation needs the candidate headwords, and asking per sentence was half
  // the request count on a Chinese entry.
  it('asks for Chinese segment candidates once, for all sentences together', async () => {
    await resolveTappableTexts(client, 'zh', ['家里有没有人？', '他有没有签字？'])
    expect(getZhSegmentCandidatesForTexts).toHaveBeenCalledTimes(1)
    expect(getZhSegmentCandidatesForTexts).toHaveBeenCalledWith(client, ['家里有没有人？', '他有没有签字？'])
  })

  it('does not look for Chinese characters when the language is not Chinese', async () => {
    await resolveTappableTexts(client, 'es', ['hola amigo'])
    expect(getCharacters).not.toHaveBeenCalled()
    expect(getZhSegmentCandidatesForTexts).not.toHaveBeenCalled()
  })
})
