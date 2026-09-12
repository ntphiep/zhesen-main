// test/dictionary-detail-page.test.tsx
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))
vi.mock('@/lib/dictionary/cached', () => ({
  getCachedEntryDetail: vi.fn(),
  getCachedCrossLanguage: vi.fn(async () => []),
  getCachedCharacters: vi.fn(async () => []),
  getCachedInflections: vi.fn(async () => []),
  getCachedEntriesContaining: vi.fn(async () => []),
  getCachedTermPreviews: vi.fn(async () => []),
  getCachedTappableTexts: vi.fn(async () => []),
}))
vi.mock('@/lib/grammar/cached', () => ({
  getCachedGrammarPointsForEntry: vi.fn(async () => []),
}))
vi.mock('@/components/lookup/LookupView', () => ({
  LookupView: ({ detail }: { detail: { headword: string } }) => <div>view:{detail.headword}</div>,
}))

import Page from '@/app/dictionary/[lang]/[id]/page'
import { getCachedEntryDetail } from '@/lib/dictionary/cached'

describe('dictionary detail page', () => {
  it('calls notFound for an unknown lang', async () => {
    await expect(Page({ params: Promise.resolve({ lang: 'fr', id: 'chien' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('calls notFound when the entry is missing', async () => {
    vi.mocked(getCachedEntryDetail).mockResolvedValueOnce(null)
    await expect(Page({ params: Promise.resolve({ lang: 'en', id: 'nope' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('reconstructs the entry id from decoded params', async () => {
    vi.mocked(getCachedEntryDetail).mockResolvedValueOnce({
      id: 'zh:狗', lang: 'zh', headword: '狗', traditional: null, level: null, ipa: null, pos: null,
      glossVi: null, glossEn: null, audioUrl: null, senses: [], pronunciations: [], examples: [],
      relations: [], attributes: {},
    })
    await Page({ params: Promise.resolve({ lang: 'zh', id: '%E7%8B%97' }) })
    expect(getCachedEntryDetail).toHaveBeenCalledWith('zh:狗')
  })
})
