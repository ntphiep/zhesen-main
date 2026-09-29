import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WordDetail, resetDetailCache } from '@/components/wordlist/WordDetail'
import { fetchEntryDetail } from '@/lib/dictionary/entryResponse'
import { callAi, aiEnabled } from '@/lib/ai/browser'
import { resetAiEnabledCache } from '@/lib/hooks/useAiEnabled'
import type { UserWord } from '@/lib/wordlist/types'

vi.mock('@/lib/ai/browser', () => ({ callAi: vi.fn(), aiEnabled: vi.fn(async () => false) }))

// The expanded row reads the cached /dictionary/entry route, not Supabase: a direct
// query from the browser paid the full round trip on every first expand.
vi.mock('@/lib/dictionary/entryResponse', () => ({
  fetchEntryDetail: vi.fn(async () => ({
    status: 'ok' as const,
    detail: {
      id: 'en:dog', lang: 'en' as const, headword: 'dog', traditional: null, level: 'A1', ipa: '/dɔːɡ/', pos: 'noun',
      glossVi: 'Con chó', glossEn: 'dog', audioUrl: null,
      senses: [{ pos: 'noun', glossVi: 'Con chó', glossEn: 'dog', senseOrder: 1 }],
      pronunciations: [{ accent: 'en-US', ipa: '/dɔːɡ/', audioUrl: null }],
      examples: [{ text: 'The dog barked.', reading: null, translationVi: 'Con chó sủa.', translationEn: null }],
      relations: [{ relationType: 'synonym', relatedText: 'hound', relatedEntryId: null }],
      attributes: {},
    },
  })),
}))

const base: UserWord = {
  id: 'id1', lang: 'en', entryId: 'en:dog', headword: 'dog', reading: null, ipa: null, pos: null,
  meaningVi: null, meaningEn: null, level: null, example: null, exampleTranslation: null,
  audioUrl: null, notes: null, status: 'new', tags: [], createdAt: 'x', updatedAt: 'x', fsrsDueAt: '2026-01-01T00:00:00Z', fsrsLapses: 0,
}

describe('WordDetail', () => {
  // The component remembers entries for the life of the tab, so a case would
  // otherwise be served the previous case's entry instead of calling the mock.
  beforeEach(() => {
    resetDetailCache()
    resetAiEnabledCache()
    vi.mocked(aiEnabled).mockResolvedValue(false)
  })

  it('loads and shows dictionary detail when entryId present', async () => {
    render(<WordDetail word={base} />)
    expect(await screen.findByText('Con chó sủa.')).toBeInTheDocument()
    expect(screen.getByText('hound')).toBeInTheDocument()
  })

  // The raw relation type and accent tag ("synonym", "en-US") are data, not labels; the
  // dictionary page's own labels are what a learner reads.
  it('labels relations and accents the way the dictionary page does', async () => {
    render(<WordDetail word={base} />)
    expect(await screen.findByText('Cận nghĩa')).toBeInTheDocument()
    expect(screen.queryByText('synonym')).toBeNull()
    expect(screen.queryByText('en-US')).toBeNull()
  })

  it('shows user fields for a manual word', () => {
    render(<WordDetail word={{ ...base, entryId: null, meaningVi: 'tự nhập', notes: 'ghi chú' }} />)
    expect(screen.getByText('tự nhập')).toBeInTheDocument()
    expect(screen.getByText('ghi chú')).toBeInTheDocument()
  })

  // Expanding a row, collapsing it and expanding it again unmounts and remounts this
  // component; a remount must not repeat the request.
  it('does not fetch again for an entry it already loaded', async () => {
    const { unmount } = render(<WordDetail word={base} />)
    expect(await screen.findByText('Con chó sủa.')).toBeInTheDocument()
    const callsAfterFirst = vi.mocked(fetchEntryDetail).mock.calls.length
    unmount()
    render(<WordDetail word={base} />)
    expect(screen.getByText('Con chó sủa.')).toBeInTheDocument()
    expect(vi.mocked(fetchEntryDetail).mock.calls.length).toBe(callsAfterFirst)
  })

  it('shows error message when the request fails', async () => {
    vi.mocked(fetchEntryDetail).mockRejectedValueOnce(new Error('network error'))
    render(<WordDetail word={base} />)
    expect(await screen.findByText(/Chưa tải được/i)).toBeInTheDocument()
  })

  // A refused request is not an entry with nothing in it. Caching the refusal would
  // replay it for the rest of the session.
  it('shows an error and remembers nothing when the route refuses', async () => {
    vi.mocked(fetchEntryDetail).mockResolvedValueOnce({ status: 'refused' })
    const { unmount } = render(<WordDetail word={base} />)
    expect(await screen.findByText(/Chưa tải được/i)).toBeInTheDocument()
    unmount()
    render(<WordDetail word={base} />)
    expect(await screen.findByText('Con chó sủa.')).toBeInTheDocument()
  })

  it('links to the word page of a dictionary word', () => {
    render(<WordDetail word={base} />)
    expect(screen.getByRole('link', { name: 'Chi tiết' })).toHaveAttribute('href', '/dictionary/en/dog')
  })

  // Three senses, two examples, collocations and synonyms; the word page has the rest.
  it('shows the gist of a long entry, not the whole page', async () => {
    const sense = (n: number, glossVi: string | null) => ({ pos: 'noun', glossVi, glossEn: `english ${n}`, senseOrder: n })
    vi.mocked(fetchEntryDetail).mockResolvedValueOnce({
      status: 'ok',
      detail: {
        id: 'en:guarantee', lang: 'en', headword: 'guarantee', traditional: null, level: 'B1', ipa: null, pos: 'noun',
        glossVi: 'Sự bảo đảm', glossEn: null, audioUrl: null,
        senses: [sense(1, 'Sự bảo đảm'), sense(2, 'Bảo lãnh'), sense(3, 'Bảo hành'), sense(4, 'Người bảo lãnh'), sense(5, null)],
        pronunciations: [],
        examples: ['One.', 'Two.', 'Three.'].map((text) => ({ text, reading: null, translationVi: null, translationEn: null })),
        relations: [
          { relationType: 'collocation', relatedText: 'give a guarantee', relatedEntryId: null },
          { relationType: 'synonym', relatedText: 'warranty', relatedEntryId: null },
          { relationType: 'hypernym', relatedText: 'promise', relatedEntryId: null },
        ],
        attributes: {},
      },
    })
    render(<WordDetail word={{ ...base, entryId: 'en:guarantee', headword: 'guarantee' }} />)
    expect(await screen.findByText('Bảo hành')).toBeInTheDocument()
    expect(screen.queryByText('Người bảo lãnh')).toBeNull()
    expect(screen.queryByText('english 1')).toBeNull()
    expect(screen.getByText('Two.')).toBeInTheDocument()
    expect(screen.queryByText('Three.')).toBeNull()
    expect(screen.getByText('warranty')).toBeInTheDocument()
    expect(screen.queryByText('promise')).toBeNull()
  })

  it('marks a meaning inferred through English and one left in English', async () => {
    vi.mocked(fetchEntryDetail).mockResolvedValueOnce({
      status: 'ok',
      detail: {
        id: 'en:quay', lang: 'en', headword: 'quay', traditional: null, level: null, ipa: null, pos: 'noun',
        glossVi: null, glossEn: null, audioUrl: null,
        senses: [
          { pos: 'noun', glossVi: null, pivotVi: 'bến tàu', glossEn: 'a wharf', senseOrder: 1 },
          { pos: 'noun', glossVi: null, glossEn: 'a stone landing place', senseOrder: 2 },
        ],
        pronunciations: [], examples: [], relations: [], attributes: {},
      },
    })
    render(<WordDetail word={{ ...base, entryId: 'en:quay', headword: 'quay' }} />)
    expect(await screen.findByText('bến tàu')).toBeInTheDocument()
    expect(screen.getByText('qua tiếng Anh')).toBeInTheDocument()
    expect(screen.getByText('a stone landing place')).toBeInTheDocument()
    expect(screen.getByText('chưa dịch')).toBeInTheDocument()
    expect(screen.queryByText('a wharf')).toBeNull()
  })

  // The button is live while the entry loads; its answer must outlast the load.
  it('keeps an answer asked for while the entry was loading', async () => {
    vi.mocked(aiEnabled).mockResolvedValue(true)
    vi.mocked(callAi).mockResolvedValue({
      status: 'ok', data: { mnemonic: 'dog nhớ là chó', collocations: [], examples: [], confusables: [] },
    })
    let finish: (v: Awaited<ReturnType<typeof fetchEntryDetail>>) => void = () => {}
    vi.mocked(fetchEntryDetail).mockReturnValueOnce(new Promise((r) => { finish = r }))
    render(<WordDetail word={base} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Hỏi AI về dog' }))
    expect(await screen.findByText('dog nhớ là chó')).toBeInTheDocument()
    finish({
      status: 'ok',
      detail: {
        id: 'en:dog', lang: 'en', headword: 'dog', traditional: null, level: null, ipa: null, pos: 'noun',
        glossVi: 'Con chó', glossEn: 'dog', audioUrl: null,
        senses: [{ pos: 'noun', glossVi: 'Con chó', glossEn: 'dog', senseOrder: 1 }],
        pronunciations: [], examples: [], relations: [], attributes: {},
      },
    })
    expect(await screen.findByText('Con chó')).toBeInTheDocument()
    expect(screen.getByText('dog nhớ là chó')).toBeInTheDocument()
  })

  // A word typed in by hand has no entry to open, so it opens the lookup instead.
  it('links a manual word to the lookup for its headword', () => {
    render(<WordDetail word={{ ...base, entryId: null }} />)
    expect(screen.getByRole('link', { name: 'Tra từ này' })).toHaveAttribute('href', '/dictionary?q=dog&lang=en')
  })
})
