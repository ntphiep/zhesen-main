import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CharacterPanel } from '@/components/lookup/CharacterPanel'
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
