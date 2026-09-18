import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WordDetail, resetDetailCache } from '@/components/wordlist/WordDetail'
import { getEntryDetail } from '@/lib/dictionary/entryDetail'
import type { UserWord } from '@/lib/wordlist/types'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/dictionary/entryDetail', () => ({
  getEntryDetail: vi.fn(async () => ({
    id: 'en:dog', lang: 'en', headword: 'dog', traditional: null, level: 'A1', ipa: '/dɔːɡ/', pos: 'noun',
    glossVi: 'con chó', glossEn: 'dog', audioUrl: null,
    senses: [{ pos: 'noun', glossVi: 'con chó', glossEn: 'dog', senseOrder: 1 }],
    pronunciations: [{ accent: 'en-US', ipa: '/dɔːɡ/', audioUrl: null }],
    examples: [{ text: 'The dog barked.', reading: null, translationVi: 'Con chó sủa.', translationEn: null }],
    relations: [{ relationType: 'synonym', relatedText: 'hound', relatedEntryId: null }],
    attributes: {},
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
  beforeEach(resetDetailCache)

  it('loads and shows dictionary detail when entryId present', async () => {
    render(<WordDetail word={base} />)
    expect(await screen.findByText('Con chó sủa.')).toBeInTheDocument()
    expect(screen.getByText('hound')).toBeInTheDocument()
  })

  it('shows user fields for a manual word', () => {
    render(<WordDetail word={{ ...base, entryId: null, meaningVi: 'tự nhập', notes: 'ghi chú' }} />)
    expect(screen.getByText('tự nhập')).toBeInTheDocument()
    expect(screen.getByText('ghi chú')).toBeInTheDocument()
  })

  // Expanding a row, collapsing it and expanding it again unmounts and remounts
  // this component; a remount must not repeat the round trip to Supabase, since
  // the entry page already serves the same data from a one-hour server cache.
  it('does not ask Supabase again for an entry it already loaded', async () => {
    const { unmount } = render(<WordDetail word={base} />)
    expect(await screen.findByText('Con chó sủa.')).toBeInTheDocument()
    const callsAfterFirst = vi.mocked(getEntryDetail).mock.calls.length
    unmount()
    render(<WordDetail word={base} />)
    expect(screen.getByText('Con chó sủa.')).toBeInTheDocument()
    expect(vi.mocked(getEntryDetail).mock.calls.length).toBe(callsAfterFirst)
  })

  it('shows error message when detail fetch fails', async () => {
    vi.mocked(getEntryDetail).mockRejectedValueOnce(new Error('network error'))
    render(<WordDetail word={base} />)
    expect(await screen.findByText(/Không tải được/i)).toBeInTheDocument()
  })
})
