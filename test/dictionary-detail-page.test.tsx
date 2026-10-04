import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))
vi.mock('@/lib/dictionary/cached', () => ({
  LEX_REVALIDATE: 604800,
  getCachedEntryDetail: vi.fn(),
  getCachedCrossLanguage: vi.fn(async () => []),
  getCachedCharacters: vi.fn(async () => []),
  getCachedInflections: vi.fn(async () => []),
  getCachedEntriesContaining: vi.fn(async () => []),
  getCachedTermPreviews: vi.fn(async () => []),
  getCachedTappableTexts: vi.fn(async () => []),
  getCachedWordKin: vi.fn(async () => []),
}))
vi.mock('@/lib/grammar/cached', () => ({
  getCachedGrammarPointsForEntry: vi.fn(async () => []),
}))
vi.mock('@/components/lookup/LookupView', () => ({
  LookupView: ({ detail }: { detail: { headword: string } }) => <div>view:{detail.headword}</div>,
}))

import Page, { generateMetadata } from '@/app/dictionary/[lang]/[id]/page'
import { getCachedEntryDetail, getCachedTermPreviews } from '@/lib/dictionary/cached'

describe('dictionary detail page', () => {
  it('calls notFound for an unknown lang', async () => {
    await expect(Page({ params: Promise.resolve({ lang: 'fr', id: 'chien' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('calls notFound when the entry is missing', async () => {
    vi.mocked(getCachedEntryDetail).mockResolvedValueOnce(null)
    await expect(Page({ params: Promise.resolve({ lang: 'en', id: 'nope' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  // Measured against `next start`: an ASCII segment arrives decoded, a
  // percent-encoded one does not, so the page has to decode and must survive a
  // segment that is not valid encoding.
  it('decodes a percent-encoded segment', async () => {
    vi.mocked(getCachedEntryDetail).mockResolvedValueOnce({
      id: 'zh:狗', lang: 'zh', headword: '狗', traditional: null, level: null, ipa: null, pos: null,
      glossVi: null, glossEn: null, audioUrl: null, senses: [], pronunciations: [], examples: [],
      relations: [], attributes: {},
    })
    await Page({ params: Promise.resolve({ lang: 'zh', id: '%E7%8B%97' }) })
    expect(getCachedEntryDetail).toHaveBeenCalledWith('zh:狗')
  })
  // emitted kept its own canonical and title while its page showed emit.
  it('points the canonical of a form that opens its lemma at the lemma, and says so in the title', async () => {
    const entry = (id: string, headword: string, glossEn: string, glossVi: string) => ({
      id, lang: 'en' as const, headword, traditional: null, level: null, ipa: null, pos: 'verb',
      glossVi: null, glossEn: null, audioUrl: null, senses: [{ pos: 'verb', glossEn, glossVi, senseOrder: 1 }],
      pronunciations: [], examples: [], relations: [], attributes: {},
    })
    const emitted = entry('en:emitted', 'emitted', 'simple past and past participle of emit', 'quá khứ của emit')
    const emit = entry('en:emit', 'emit', 'To send out.', 'phát ra')
    vi.mocked(getCachedEntryDetail).mockImplementation(async (id: string) => ({ 'en:emitted': emitted, 'en:emit': emit })[id] ?? null)
    vi.mocked(getCachedTermPreviews).mockResolvedValue([
      { matchText: 'emit', id: 'en:emit', headword: 'emit', pos: 'verb', ipa: null, reading: null, gender: null, glossVi: 'phát ra', glossEn: null },
    ])
    const meta = await generateMetadata({ params: Promise.resolve({ lang: 'en', id: 'emitted' }) })
    expect(String(meta.alternates?.canonical)).toMatch(/\/dictionary\/en\/emit$/)
    expect(meta.title).toBe('emitted là gì? Dạng của emit')
    const own = await generateMetadata({ params: Promise.resolve({ lang: 'en', id: 'emit' }) })
    expect(String(own.alternates?.canonical)).toMatch(/\/dictionary\/en\/emit$/)
    expect(own.title).toBe('emit là gì? Nghĩa tiếng Việt')
  })
  it('does not throw on a param that is not valid percent-encoding', async () => {
    vi.mocked(getCachedEntryDetail).mockResolvedValueOnce(null)
    await expect(Page({ params: Promise.resolve({ lang: 'en', id: '%' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(getCachedEntryDetail).toHaveBeenCalledWith('en:%')
  })
})
