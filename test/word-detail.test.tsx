import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WordDetail } from '@/components/wordlist/WordDetail'
import type { UserWord } from '@/lib/wordlist/types'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/dictionary/search', () => ({
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
  audioUrl: null, notes: null, status: 'new', tags: [], createdAt: 'x', updatedAt: 'x',
}

describe('WordDetail', () => {
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
})
