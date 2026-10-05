import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LookupHero } from '@/components/lookup/LookupHero'
import { SenseList } from '@/components/lookup/SenseList'
import { AddToWordlistButton } from '@/components/lookup/AddToWordlistButton'
import { addWord } from '@/lib/wordlist/store'
import type { DictEntryDetail } from '@/lib/dictionary/types'

/** `IpaLinked` splits a transcription into one link per sound, so no single node holds
 *  the whole string. Match the wrapper by its own text instead. */
const ipa = (want: string) => (_: string, el: Element | null) =>
  el?.classList.contains('ipa') === true && el.textContent === want

vi.mock('@/lib/supabase/client', async () => {
  const { accountAuthStub } = await import('./helpers/supabase')
  // The add button reads the account, so the client stub carries a signed-in user.
  return { createClient: () => accountAuthStub({ id: 'u1', email: 'a@b.com' }) }
})
vi.mock('@/lib/wordlist/store', () => ({
  addWord: vi.fn(async () => ({})),
  draftFromDictEntry: (e: { headword: string }) => ({ headword: e.headword }),
  isWordSaved: vi.fn(async () => false),
}))
// SenseList renders example text through TappableText (per-word spans); stub it
// so these tests assert structure, not tap-to-lookup behavior.
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
  pronunciations: [
    { accent: 'en-UK', ipa: 'dɒɡ', audioUrl: 'https://upload.wikimedia.org/.../En-uk-dog.ogg' },
    { accent: 'en-US', ipa: 'dɑɡ', audioUrl: 'https://upload.wikimedia.org/.../En-us-dog.ogg' },
  ],
  examples: [], relations: [], attributes: {},
}

describe('LookupHero', () => {
  it('shows headword, level and per-accent UK/US pronunciations', () => {
    render(<LookupHero detail={detail} />)
    expect(screen.getByRole('heading', { name: 'dog' })).toBeInTheDocument()
    expect(screen.getByText('A1')).toBeInTheDocument()
    expect(screen.getByText('UK')).toBeInTheDocument()
    expect(screen.getByText(ipa('/dɒɡ/'))).toBeInTheDocument()
    expect(screen.getByText('US')).toBeInTheDocument()
    expect(screen.getByText(ipa('/dɑɡ/'))).toBeInTheDocument()
  })
  it('shows Hán-Việt when provided', () => {
    render(<LookupHero detail={{ ...detail, lang: 'zh' }} hanViet="khuyển" />)
    expect(screen.getByText(/khuyển/)).toBeInTheDocument()
  })
  it('shows a "Hay gặp" badge for high-frequency words only', () => {
    const { rerender } = render(<LookupHero detail={{ ...detail, frequencyRank: 500 }} />)
    expect(screen.getByText('Hay gặp')).toBeInTheDocument()
    rerender(<LookupHero detail={{ ...detail, frequencyRank: 9000 }} />)
    expect(screen.queryByText('Hay gặp')).not.toBeInTheDocument()
  })

  // The pronunciation row below the heading already shows the pinyin beside the
  // audio button, so the heading printed the same syllables twice in a row.
  it('does not repeat the pinyin the pronunciation row already shows', () => {
    const withReading = {
      ...detail, lang: 'zh' as const,
      attributes: { pinyin: 'yǒu méi yǒu' },
      pronunciations: [{ accent: '', ipa: 'yǒu méi yǒu', audioUrl: null }],
    }
    render(<LookupHero detail={withReading} />)
    expect(screen.getAllByText('yǒu méi yǒu')).toHaveLength(1)
  })

  it('still shows the pinyin when there is no pronunciation row at all', () => {
    const noProns = {
      ...detail, lang: 'zh' as const,
      attributes: { pinyin: 'gǒu' },
      pronunciations: [],
    }
    render(<LookupHero detail={noProns} />)
    expect(screen.getByText('gǒu')).toBeInTheDocument()
  })
})

describe('SenseList', () => {
  it('groups senses by part of speech', () => {
    render(<SenseList senses={detail.senses} lang="zh" />)
    expect(screen.getByText('con chó')).toBeInTheDocument()
    expect(screen.getByText('theo dõi')).toBeInTheDocument()
  })
  it('renders nothing when empty', () => {
    const { container } = render(<SenseList senses={[]} lang="zh" />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('AddToWordlistButton', () => {
  it('adds the entry and shows confirmation', async () => {
    render(<AddToWordlistButton entry={detail} />)
    await userEvent.click(await screen.findByRole('button', { name: /Thêm vào sổ tay/i }))
    expect(addWord).toHaveBeenCalled()
    expect(await screen.findByText('Đã thêm')).toBeInTheDocument()
  })
})
