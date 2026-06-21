import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CharacterPanel } from '@/components/lookup/CharacterPanel'
import { RelatedWords } from '@/components/lookup/RelatedWords'
import { CrossLanguagePanel } from '@/components/lookup/CrossLanguagePanel'

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

describe('RelatedWords', () => {
  it('renders nothing when there are no text relations', () => {
    const { container } = render(<RelatedWords lang="en" relations={[{ relationType: 'synonym', relatedText: null, relatedEntryId: null }]} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('groups chips by type and links to a re-search', () => {
    render(<RelatedWords lang="en" relations={[{ relationType: 'synonym', relatedText: 'hound', relatedEntryId: null }]} />)
    expect(screen.getByText('Cận nghĩa')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'hound' })
    expect(link).toHaveAttribute('href', '/dictionary?q=hound&lang=en')
  })
})

describe('CrossLanguagePanel', () => {
  it('renders nothing when empty', () => {
    const { container } = render(<CrossLanguagePanel siblings={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('links each sibling to its detail page', () => {
    render(<CrossLanguagePanel siblings={[{ id: 'es:perro', lang: 'es', headword: 'perro', glossVi: 'con chó', glossEn: 'dog' }]} />)
    const link = screen.getByRole('link', { name: /perro/ })
    expect(link).toHaveAttribute('href', '/dictionary/es/perro')
  })
})
