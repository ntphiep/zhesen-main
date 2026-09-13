import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CharacterPanel } from '@/components/lookup/CharacterPanel'
import { RelatedWords } from '@/components/lookup/RelatedWords'
import { CrossLanguagePanel } from '@/components/lookup/CrossLanguagePanel'
import { WordFamily } from '@/components/lookup/WordFamily'
import { groupWordForms } from '@/lib/dictionary/family'
import type { TermPreview } from '@/lib/dictionary/types'

describe('CharacterPanel', () => {
  it('renders nothing when empty', () => {
    const { container } = render(<CharacterPanel characters={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('shows glyph, radical, strokes and Hán-Việt', () => {
    render(<CharacterPanel characters={[{ char: '狗', radical: '犬', strokeCount: 8, hanViet: ['cẩu'], pinyin: ['gǒu'], gloss: 'dog' }]} />)
    expect(screen.getByText('狗')).toBeInTheDocument()
    expect(screen.getByText(/犬/)).toBeInTheDocument()
    expect(screen.getByText(/cẩu/)).toBeInTheDocument()
    expect(screen.getByText(/8 nét/)).toBeInTheDocument()
  })
})

const preview = (over: Partial<TermPreview> & { matchText: string }): TermPreview => ({
  id: `en:${over.matchText}`, headword: over.matchText, pos: null, ipa: null,
  reading: null, gender: null, glossVi: null, glossEn: null, ...over,
})

describe('RelatedWords', () => {
  it('renders nothing when there are no text relations', () => {
    const { container } = render(<RelatedWords lang="en" previews={{}} relations={[{ relationType: 'synonym', relatedText: null, relatedEntryId: null }]} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('groups by type and links to a re-search', () => {
    render(<RelatedWords lang="en" previews={{}} relations={[{ relationType: 'synonym', relatedText: 'hound', relatedEntryId: null }]} />)
    expect(screen.getByText('Cận nghĩa')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'hound' })
    expect(link).toHaveAttribute('href', '/dictionary?q=hound&lang=en')
  })
  it('shows the part of speech and meaning of a related word', () => {
    render(
      <RelatedWords
        lang="en"
        relations={[{ relationType: 'synonym', relatedText: 'hound', relatedEntryId: null }]}
        previews={{ hound: preview({ matchText: 'hound', pos: 'noun', glossVi: 'chó săn' }) }}
      />,
    )
    expect(screen.getByText('Danh từ')).toBeInTheDocument()
    expect(screen.getByText('chó săn')).toBeInTheDocument()
  })
  it('still lists a word the dictionary has no entry for', () => {
    // Most related words are stored as bare text and never resolve to an entry;
    // dropping them would hide most of the section.
    render(<RelatedWords lang="en" previews={{}} relations={[{ relationType: 'synonym', relatedText: 'lanate', relatedEntryId: null }]} />)
    expect(screen.getByRole('link', { name: 'lanate' })).toBeInTheDocument()
  })
})

describe('WordFamily', () => {
  const forms = groupWordForms([
    { formText: 'smoothed', formLabel: 'participle past' },
    { formText: 'smeeth', formLabel: 'alternative dialectal' },
    { formText: 'smoother', formLabel: 'comparative' },
  ])

  // With no preview for any form there is no part of speech, pronunciation or
  // meaning to tabulate, so these render as a running line rather than a table of
  // one word per row. The order still matters: real inflections first, dialectal
  // and archaic spellings last.
  it('names each form and sinks the variants below the real inflections', () => {
    const { container } = render(<WordFamily headword="smooth" lang="en" forms={forms} previews={{}} />)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText(/Phân từ II \(quá khứ\)/)).toBeInTheDocument()
    expect(screen.getByText(/So sánh hơn/)).toBeInTheDocument()
    const text = container.textContent ?? ''
    expect(text).toContain('smeeth')
    expect(text).toContain('phương ngữ')
    expect(text.indexOf('smeeth')).toBeGreaterThan(text.indexOf('smoother'))
  })

  it('shows the pronunciation and meaning when the form is an entry of its own', () => {
    render(
      <WordFamily
        headword="smooth"
        lang="en"
        forms={forms}
        previews={{ smoother: preview({ matchText: 'smoother', ipa: 'smuðɝ', glossVi: 'nhẵn hơn' }) }}
      />,
    )
    expect(screen.getByText('/smuðɝ/')).toBeInTheDocument()
    expect(screen.getByText('nhẵn hơn')).toBeInTheDocument()
  })
})

describe('CrossLanguagePanel', () => {
  it('renders nothing when empty', () => {
    const { container } = render(<CrossLanguagePanel siblings={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('links each sibling to its detail page', () => {
    render(<CrossLanguagePanel siblings={[{ id: 'es:perro', lang: 'es', headword: 'perro', reading: null, gender: 'm', pos: 'noun', glossVi: 'con chó', glossEn: 'dog' }]} />)
    const link = screen.getByRole('link', { name: /perro/ })
    expect(link).toHaveAttribute('href', '/dictionary/es/perro')
  })
  it('groups by language and shows pinyin for a Chinese equivalent', () => {
    render(
      <CrossLanguagePanel
        siblings={[
          { id: 'es:perro', lang: 'es', headword: 'perro', reading: null, gender: 'm', pos: 'noun', glossVi: 'con chó', glossEn: 'dog' },
          { id: 'zh:狗', lang: 'zh', headword: '狗', reading: 'gǒu', gender: null, pos: null, glossVi: 'chó', glossEn: 'dog' },
        ]}
      />,
    )
    expect(screen.getByText('Tiếng Trung')).toBeInTheDocument()
    expect(screen.getByText('Tiếng Tây Ban Nha')).toBeInTheDocument()
    expect(screen.getByText('gǒu')).toBeInTheDocument()
  })
  it('marks the gender of a Spanish noun', () => {
    // A Spanish noun cannot be used without it: the article, the adjective and
    // the pronoun all agree with it.
    render(<CrossLanguagePanel siblings={[{ id: 'es:perro', lang: 'es', headword: 'perro', reading: null, gender: 'm', pos: 'noun', glossVi: 'con chó', glossEn: 'dog' }]} />)
    expect(screen.getByText('giống đực')).toBeInTheDocument()
  })
})
