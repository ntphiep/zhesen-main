import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LookupHero } from '@/components/lookup/LookupHero'
import { SenseList } from '@/components/lookup/SenseList'
import { ExampleList } from '@/components/lookup/ExampleList'
import { AddToWordlistButton } from '@/components/lookup/AddToWordlistButton'
import { addWord } from '@/lib/wordlist/store'
import type { DictEntryDetail } from '@/lib/dictionary/types'

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
    expect(screen.getByText('/dɒɡ/')).toBeInTheDocument()
    expect(screen.getByText('US')).toBeInTheDocument()
    expect(screen.getByText('/dɑɡ/')).toBeInTheDocument()
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

  // The crawler filled the translation field with the entry's own meaning whenever
  // the source page carried no per-sentence translation, which is most of the time.
  // Printing it under the sentence claims it is a translation of that sentence.
  it('hides a "translation" that is really the entry gloss copied over', () => {
    render(
      <ExampleList
        lang="en"
        glosses={['con chó']}
        examples={[{ text: 'The dog barked.', reading: null, translationVi: 'con chó', translationEn: null }]}
      />,
    )
    expect(screen.getByText('The dog barked.')).toBeInTheDocument()
    expect(screen.queryByText('con chó')).toBeNull()
  })

  // "holyground." reached the page because the hand-written word list behind
  // isCleanExample has neither "holy" nor "ground" on it. The server already
  // resolved every token against the dictionary to make them tappable, so the
  // sentence can be judged against the dictionary instead of a list.
  it('drops a sentence whose long words the dictionary does not know', () => {
    const { container } = render(
      <ExampleList
        lang="en"
        examples={[{ text: 'holyground.', reading: null, translationVi: null, translationEn: null }]}
        resolved={[{ text: 'holyground.', segments: [{ text: 'holyground', word: true }, { text: '.', word: false }], entries: [], chars: [] }]}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('keeps a sentence whose words all resolved', () => {
    render(
      <ExampleList
        lang="en"
        examples={[{ text: 'The dog barked.', reading: null, translationVi: null, translationEn: null }]}
        resolved={[{
          text: 'The dog barked.',
          segments: [{ text: 'The', word: true }, { text: ' ', word: false }, { text: 'dog', word: true }, { text: ' ', word: false }, { text: 'barked', word: true }, { text: '.', word: false }],
          entries: [['barked', { id: 'en:bark' } as never]],
          chars: [],
        }]}
      />,
    )
    expect(screen.getByText('The dog barked.')).toBeInTheDocument()
  })

  it('still shows a real translation when the entry gloss is given', () => {
    render(
      <ExampleList
        lang="en"
        glosses={['con chó']}
        examples={[{ text: 'The dog barked.', reading: null, translationVi: 'Con chó sủa.', translationEn: null }]}
      />,
    )
    expect(screen.getByText('Con chó sủa.')).toBeInTheDocument()
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
