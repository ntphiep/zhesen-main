import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LookupHero } from '@/components/lookup/LookupHero'
import { SenseList } from '@/components/lookup/SenseList'
import { ExampleList } from '@/components/lookup/ExampleList'
import { AddToWordlistButton } from '@/components/lookup/AddToWordlistButton'
import { addWord } from '@/lib/wordlist/store'
import type { DictEntryDetail } from '@/lib/dictionary/types'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/wordlist/store', () => ({
  addWord: vi.fn(async () => ({})),
  draftFromDictEntry: (e: { headword: string }) => ({ headword: e.headword }),
}))
// ExampleList renders example text through TappableText (per-word spans); stub it
// so these tests assert ExampleList structure, not tap-to-lookup behavior.
vi.mock('@/components/reader/TappableText', () => ({
  TappableText: ({ text }: { text: string }) => <span>{text}</span>,
}))

const detail: DictEntryDetail = {
  id: 'en:dog', lang: 'en', headword: 'dog', traditional: null, level: 'A1', ipa: 'dɔːɡ', pos: 'noun',
  glossVi: 'con chó', glossEn: 'dog', audioUrl: null,
  senses: [
    { pos: 'noun', glossVi: 'con chó', glossEn: 'a dog', senseOrder: 1 },
    { pos: 'verb', glossVi: 'theo dõi', glossEn: null, senseOrder: 2 },
  ],
  pronunciations: [], examples: [], relations: [], attributes: {},
}

describe('LookupHero', () => {
  it('shows headword, ipa and level', () => {
    render(<LookupHero detail={detail} />)
    expect(screen.getByRole('heading', { name: 'dog' })).toBeInTheDocument()
    expect(screen.getByText('/dɔːɡ/')).toBeInTheDocument()
    expect(screen.getByText('A1')).toBeInTheDocument()
  })
  it('shows Hán-Việt when provided', () => {
    render(<LookupHero detail={{ ...detail, lang: 'zh' }} hanViet="khuyển" />)
    expect(screen.getByText(/khuyển/)).toBeInTheDocument()
  })
})

describe('SenseList', () => {
  it('groups senses by part of speech', () => {
    render(<SenseList senses={detail.senses} />)
    expect(screen.getByText('con chó')).toBeInTheDocument()
    expect(screen.getByText('theo dõi')).toBeInTheDocument()
  })
  it('renders nothing when empty', () => {
    const { container } = render(<SenseList senses={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('ExampleList', () => {
  it('renders nothing when empty', () => {
    const { container } = render(<ExampleList examples={[]} lang="en" />)
    expect(container).toBeEmptyDOMElement()
  })
  it('shows example text and translation', () => {
    render(<ExampleList lang="en" examples={[{ text: 'The dog barked.', reading: null, translationVi: 'Con chó sủa.', translationEn: null }]} />)
    expect(screen.getByText('The dog barked.')).toBeInTheDocument()
    expect(screen.getByText('Con chó sủa.')).toBeInTheDocument()
  })
})

describe('AddToWordlistButton', () => {
  it('adds the entry and shows confirmation', async () => {
    render(<AddToWordlistButton entry={detail} />)
    await userEvent.click(screen.getByRole('button', { name: /Thêm vào sổ tay/i }))
    expect(addWord).toHaveBeenCalled()
    expect(await screen.findByText(/Đã thêm/i)).toBeInTheDocument()
  })
})
