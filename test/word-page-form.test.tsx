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

  // better opened good's page, and its own verb and noun senses could not be reached.
  it('keeps its own page, level and forms when it has senses of its own', async () => {
    const better = entry('en:better', 'better', [
      sense('comparative form of good: more good', 'so sánh hơn của good', { pos: 'adj' }),
      sense('To improve.', 'cải thiện', { senseOrder: 2 }),
      sense('A superior.', 'người hơn', { pos: 'noun', senseOrder: 3 }),
    ], { level: 'A1', pos: 'adj' })
    vi.mocked(getCachedEntryDetail).mockImplementation(async (id: string) => ({ 'en:better': better, 'en:good': emit })[id] ?? null)
    vi.mocked(getCachedTermPreviews).mockResolvedValue([{ matchText: 'good', id: 'en:good', headword: 'good', pos: 'adj', ipa: null, reading: null, gender: null, glossVi: 'tốt', glossEn: null }])
    vi.mocked(getCachedInflections).mockResolvedValueOnce([{ formText: 'bettered', formLabel: 'past' }])
    const data = await loadWordPage('en:better')
    expect(data?.detail.id).toBe('en:better')
    expect(data?.formOf).toBeUndefined()
    const view = buildWordView(data!)
    expect(view.head.level).toBe('A1')
    expect(view.forms.map((f) => f.text)).toEqual(['bettered'])
  })

  // sobre is a preposition whose verb senses are forms of sobrar.
  it('keeps its own page when only a later part of speech is a form', async () => {
    const sobre = entry('es:sobre', 'sobre', [
      sense('on, upon', 'trên', { pos: 'prep' }),
      sense('envelope', 'phong bì', { pos: 'noun', senseOrder: 2 }),
      sense('inflection of sobrar:', 'dạng của sobrar', { senseOrder: 3 }),
    ], { lang: 'es', pos: 'prep' })
    vi.mocked(getCachedEntryDetail).mockImplementation(async (id: string) => ({ 'es:sobre': sobre, 'es:sobrar': emit })[id] ?? null)
    vi.mocked(getCachedTermPreviews).mockResolvedValue([{ matchText: 'sobrar', id: 'es:sobrar', headword: 'sobrar', pos: 'verb', ipa: null, reading: null, gender: null, glossVi: 'thừa', glossEn: null }])
    expect((await loadWordPage('es:sobre'))?.detail.id).toBe('es:sobre')
  })

  // went's first sense is the obsolete noun "a path"; the rest is a form of go.
  it('opens the lemma of a form whose only other sense is obsolete', async () => {
    const went = entry('en:went', 'went', [
      sense('A path.', 'lối đi', { pos: 'noun', register: 'obsolete' }),
      sense('simple past of go', 'quá khứ của go', { senseOrder: 2 }),
    ])
    vi.mocked(getCachedEntryDetail).mockImplementation(async (id: string) => ({ 'en:went': went, 'en:go': emit })[id] ?? null)
    vi.mocked(getCachedTermPreviews).mockResolvedValue([{ matchText: 'go', id: 'en:go', headword: 'go', pos: 'verb', ipa: null, reading: null, gender: null, glossVi: 'đi', glossEn: null }])
    expect((await loadWordPage('en:went'))?.formOf?.id).toBe('en:went')
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
