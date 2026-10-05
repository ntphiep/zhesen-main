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

import { lookUpText } from '@/lib/dictionary/textLookup'

const client = {} as SupabaseClient
const preview = (headword: string): DictEntryPreview => ({
  id: `en:${headword}`, lang: 'en', headword, traditional: null, level: null,
  ipa: null, pos: 'noun,verb', glossVi: 'Nghĩa', glossEn: null, audioUrl: null,
})

beforeEach(() => vi.clearAllMocks())

describe('lookUpText', () => {
  it('returns every word of the sentence in the order it was written', async () => {
    resolveTokens.mockResolvedValueOnce(new Map([['dog', preview('dog')]]))
    const out = await lookUpText(client, 'The dog barks.')
    expect(out.words.map((w) => w.text)).toEqual(['The', 'dog', 'barks'])
  })

  // A word the dictionary does not hold is an answer, not a gap: dropping it would
  // renumber the passage against what the learner is reading.
  it('keeps a word with no entry, marked as unresolved', async () => {
    resolveTokens.mockResolvedValueOnce(new Map([['dog', preview('dog')]]))
    const out = await lookUpText(client, 'dog zzzz')
    expect(out.words.map((w) => w.entry?.headword ?? null)).toEqual(['dog', null])
  })

  it('matches a capitalised word against its lowercased entry', async () => {
    resolveTokens.mockResolvedValueOnce(new Map([['dog', preview('dog')]]))
    const out = await lookUpText(client, 'Dog')
    expect(out.words[0].entry?.id).toBe('en:dog')
  })

  it('reads Han text as Chinese, so it is segmented rather than split on spaces', async () => {
    getZhSegmentCandidatesForTexts.mockResolvedValueOnce(['吃饭'])
    const out = await lookUpText(client, '我吃饭')
    expect(out.lang).toBe('zh')
    expect(out.words.map((w) => w.text)).toEqual(['我', '吃饭'])
  })

  it('reads a Spanish-only letter as Spanish', async () => {
    const out = await lookUpText(client, 'el niño come')
    expect(out.lang).toBe('es')
  })

  it('finds a phrasal verb written in an inflected form, alongside its words', async () => {
    resolveTokens.mockResolvedValueOnce(new Map([['gave', preview('gave')], ['gave up', preview('give up')]]))
    const out = await lookUpText(client, 'I gave up smoking.')
    expect(out.phrases).toEqual([{ text: 'gave up', entry: preview('give up') }])
    expect(out.words.find((w) => w.text === 'gave')?.entry?.id).toBe('en:gave')
    // One round trip carries the words and the phrase candidates together.
    expect(resolveTokens).toHaveBeenCalledTimes(1)
    expect(resolveTokens).toHaveBeenCalledWith(client, 'en', expect.arrayContaining(['I', 'gave', 'gave up', 'gave up smoking']))
  })

  it('finds a separable phrasal verb with its object in between', async () => {
    resolveTokens.mockResolvedValueOnce(new Map([['turned down', preview('turn down')]]))
    const out = await lookUpText(client, 'They turned it down')
    expect(out.phrases).toEqual([{ text: 'turned it down', entry: preview('turn down') }])
  })

  it('looks for no phrase in Chinese, which segmentation already joins', async () => {
    getZhSegmentCandidatesForTexts.mockResolvedValueOnce(['吃饭'])
    const out = await lookUpText(client, '我吃饭')
    expect(out.phrases).toEqual([])
  })

  it('answers empty for a passage with nothing in it', async () => {
    const out = await lookUpText(client, '   ')
    expect(out.words).toEqual([])
    expect(resolveTokens).not.toHaveBeenCalled()
  })

  // 19,512 of 64,005 Spanish Tatoeba sentences carry no Spanish-only letter, so the letter
  // rule read them as English: casa answered "Một thị trấn ở Arkansas".
  it('reads the passage in the language the caller names', async () => {
    const out = await lookUpText(client, 'Tengo un perro en mi casa', 'es')
    expect(out.lang).toBe('es')
    expect(resolveTokens).toHaveBeenCalledWith(client, 'es', expect.arrayContaining(['perro', 'casa']))
  })

  it('finds a Spanish fixed phrase in a Spanish passage', async () => {
    const sinEmbargo = { ...preview('sin embargo'), id: 'es:sin embargo', lang: 'es' as const }
    resolveTokens.mockResolvedValueOnce(new Map([['sin embargo', sinEmbargo]]))
    const out = await lookUpText(client, 'Sin embargo, no quiero', 'es')
    expect(out.phrases).toEqual([{ text: 'Sin embargo', entry: sinEmbargo }])
  })

  it('falls back to the letter rule when no language is named', async () => {
    const out = await lookUpText(client, 'Tengo un perro en mi casa')
    expect(out.lang).toBe('en')
  })
})
