import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, within } from '@testing-library/react'
import { LookupView } from '@/components/lookup/LookupView'
import { parseLearnerLayer } from '@/lib/dictionary/learner'
import { wordLayout } from '@/lib/dictionary/wordLayout'
import { layerRanked, layerSummary, mainSenses, senseSections } from '@/lib/dictionary/wordPage'
import type { DictEntryDetail, DictSense } from '@/lib/dictionary/types'

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

const sense = (n: number, glossVi: string, glossEn: string, extra: Partial<DictSense> = {}): DictSense =>
  ({ pos: 'verb', glossVi, glossEn, senseOrder: n, id: `en:take#${n}`, ...extra })

// en:take on production: sense 5 carries Wiktionary frequency 1, so the raw ranking led with it.
const senses = [
  sense(1, 'cầm, nắm', 'To grip with the hands.'),
  sense(2, 'chiếm, bắt giữ, đoạt', 'To seize or capture.'),
  sense(5, 'chiếm đoạt, lấy', 'To appropriate.', { senseFrequency: 1 }),
  sense(14, 'lấy đi, dọn đi', 'To remove.'),
  sense(31, 'uống, dùng thuốc', 'To ingest medicine.', { senseFrequency: 4 }),
]

const layerSense = (order: number, terms: string[], cefr: string, ids: string[]) => ({
  sense_order: order, pos: 'verb', vi_terms: terms, vi_definition: '', en_definition: null, domain: null,
  register: null, cefr, source_sense_ids: ids, learner_examples: [],
})
const layer = parseLearnerLayer({
  entry_id: 'en:take', gist_vi: ['cầm', 'lấy'], level: 'A1', usage_note_vi: null, status: 'published',
  learner_senses: [
    layerSense(1, ['cầm', 'lấy', 'mang', 'di chuyển'], 'A1', ['en:take#1', 'en:take#14']),
    layerSense(2, ['ăn', 'uống', 'dùng'], 'A1', ['en:take#31']),
  ],
  learner_links: [], sense_labels: [],
})

const take: DictEntryDetail = {
  id: 'en:take', lang: 'en', headword: 'take', traditional: null, level: null, ipa: null, pos: 'verb',
  glossVi: null, glossEn: null, audioUrl: null, senses, pronunciations: [], examples: [], relations: [],
  attributes: {}, senseLinks: [],
}

beforeEach(() => {
  localStorage.clear()
  wordLayout.reset()
  delete document.documentElement.dataset.wordLayout
})

describe('a published learner layer leads the page', () => {
  it('ranks the first raw sense of each core sense first, then the rest it covers', () => {
    const ranked = layerRanked(senses, layer)
    expect(senseSections(ranked)[0].senses.map((s) => s.senseOrder)).toEqual([1, 31, 14, 2, 5])
  })

  it('heads the page with the first term of each core sense', () => {
    expect(layerSummary(layer)).toBe('cầm\u00a0– ăn')
  })

  it('leaves the senses alone without a layer, or with a derived one', () => {
    expect(layerRanked(senses, null)).toBe(senses)
    expect(layerRanked(senses, { ...layer, source: 'dictionary' })).toBe(senses)
  })

  it('opens the overview on the layer sense 1 and its level, not on "chiếm đoạt"', () => {
    render(<LookupView detail={take} characters={[]} siblings={[]} learner={layer} />)
    const card = document.getElementById('meaning')!
    const items = within(card).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('cầm, lấy, mang, di chuyển')
    expect(items[0]).toHaveTextContent('A1')
    expect(card).not.toHaveTextContent('chiếm đoạt')
  })
})

describe('mainSenses', () => {
  // walk drew "Đi bộ" twice and hablar "Nói" twice.
  it('leaves out a sense whose every term an earlier one gave', () => {
    const hablar = [sense(1, 'nói, nói chuyện', 'to speak'), sense(2, 'Nói', 'to talk'), sense(3, 'nói, nhắn tin', 'to text')]
    const shown = mainSenses(senseSections(hablar)).flatMap((g) => g.senses.map((s) => s.senseOrder))
    expect(shown).toEqual([1, 3])
  })
})
