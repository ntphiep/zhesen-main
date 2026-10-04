import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { DictEntryDetail, DictSense } from '@/lib/dictionary/types'

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
vi.mock('@/lib/dictionary/learnerCached', () => ({
  getCachedLearnerLayer: vi.fn(async () => null),
  getCachedLearnerBacklinks: vi.fn(async () => []),
}))
vi.mock('@/lib/grammar/cached', () => ({ getCachedGrammarPointsForEntry: vi.fn(async () => []) }))
vi.mock('@/lib/supabase/client', async () => {
  const { accountAuthStub } = await import('./helpers/supabase')
  return { createClient: () => accountAuthStub({ id: 'u1', email: 'a@b.com' }) }
})
vi.mock('@/lib/wordlist/store', () => ({
  addWord: vi.fn(async () => ({})),
  draftFromDictEntry: (e: { headword: string }) => ({ headword: e.headword }),
  isWordSaved: vi.fn(async () => false),
}))
vi.mock('@/lib/ai/browser', () => ({ callAi: vi.fn(), aiEnabled: vi.fn(async () => false) }))

import { getCachedEntryDetail, getCachedInflections, getCachedTermPreviews } from '@/lib/dictionary/cached'
import { loadWordPage } from '@/lib/dictionary/wordPageData'
import { LookupView } from '@/components/lookup/LookupView'
import { buildWordView } from '@/lib/dictionary/wordView'

const sense = (glossEn: string, glossVi: string, over: Partial<DictSense> = {}): DictSense =>
  ({ pos: 'verb', glossVi, glossEn, senseOrder: 1, ...over })
const entry = (id: string, headword: string, senses: DictSense[], over: Partial<DictEntryDetail> = {}): DictEntryDetail => ({
  id, lang: 'en', headword, traditional: null, level: null, ipa: null, pos: 'verb', glossVi: null, glossEn: null,
  audioUrl: null, senses, pronunciations: [], examples: [], relations: [], attributes: {}, senseLinks: [], ...over,
})

const emitted = entry('en:emitted', 'emitted', [sense('simple past and past participle of emit', 'quá khứ và phân từ quá khứ của emit')], { level: 'C1' })
const emit = entry('en:emit', 'emit', [sense('To send out or give off.', 'phát ra, tỏa ra')], { level: 'C1' })

beforeEach(() => {
  vi.mocked(getCachedEntryDetail).mockImplementation(async (id: string) => ({ 'en:emitted': emitted, 'en:emit': emit })[id] ?? null)
  vi.mocked(getCachedTermPreviews).mockImplementation(async (_lang, texts: string[]) => texts.includes('emit')
    ? [{ matchText: 'emit', id: 'en:emit', headword: 'emit', pos: 'verb', ipa: null, reading: null, gender: null, glossVi: 'phát ra', glossEn: null }]
    : [])
})

describe('an inflected form', () => {
  // emitted was a page of its own: one sense, a C1 badge it does not have, and the forms of the form.
  it('opens its lemma under a line naming the form', async () => {
    const data = await loadWordPage('en:emitted')
    expect(data?.detail.id).toBe('en:emit')
    expect(data?.formOf).toEqual({ id: 'en:emitted', headword: 'emitted', note: 'quá khứ và phân từ quá khứ của' })
    render(<LookupView {...data!} />)
    const line = screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === 'emitted là quá khứ và phân từ quá khứ của emit')
    expect(line).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'emit' })).toBeInTheDocument()
  })

  it('keeps its own page, without a level or the forms of the form, when the lemma is not an entry', async () => {
    vi.mocked(getCachedTermPreviews).mockResolvedValue([])
    vi.mocked(getCachedInflections).mockResolvedValueOnce([{ formText: 'emitteds', formLabel: 'plural' }])
    const data = await loadWordPage('en:emitted')
    expect(data?.detail.id).toBe('en:emitted')
    const view = buildWordView(data!)
    expect(view.head.level).toBeNull()
    expect(view.forms).toEqual([])
  })
})
