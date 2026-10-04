import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SynonymsRows } from '@/components/lookup/WordParts'
import type { ViewWord } from '@/lib/dictionary/wordView'

const word = (text: string): ViewWord => ({ text, href: `/dictionary/en/${text}`, id: `en:${text}`, gloss: null, pos: null, level: null })

describe('SynonymsRows', () => {
  // give up showed "Từ bỏ" twice, one row per sense.
  it('lists the synonyms of two senses with the same label in one row', () => {
    render(
      <SynonymsRows
        view={{
          senseSynonyms: [
            { senseOrder: 1, label: 'Từ bỏ', words: [word('quit'), word('abandon')] },
            { senseOrder: 3, label: 'từ bỏ', words: [word('forsake'), word('quit')] },
          ],
          synonyms: [], antonyms: [],
        }}
      />,
    )
    expect(screen.getAllByText(/^từ bỏ$/i)).toHaveLength(1)
    expect(screen.getAllByText('quit')).toHaveLength(1)
    expect(screen.getByText('forsake')).toBeInTheDocument()
  })
})
