import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ConjugationTable } from '@/components/lookup/ConjugationTable'
import type { Conjugation } from '@/lib/dictionary/conjugation'

const HABLAR: Conjugation = {
  infinitive: 'hablar',
  gerund: 'hablando',
  pastParticiple: 'hablado',
  indicative: [
    { key: 'present', forms: { '1s': 'hablo', '2s': 'hablas', '3s': 'habla', '1p': 'hablamos', '2p': 'habláis', '3p': 'hablan' } },
    { key: 'future', forms: { '1s': 'hablaré', '3s': 'hablará' } },
  ],
  subjunctive: [
    { key: 'subPresent', forms: { '1s': 'hable', '3s': 'hable' } },
  ],
  imperativeAffirmative: ['habla', 'hable'],
  imperativeNegative: ['no hables'],
}

afterEach(cleanup)

describe('ConjugationTable', () => {
  it('shows the non-finite forms and present indicative collapsed by default', () => {
    render(<ConjugationTable conjugation={HABLAR} />)
    expect(screen.getByText('hablando')).toBeInTheDocument() // gerund
    expect(screen.getByText('hablo')).toBeInTheDocument() // present 1s, visible collapsed
    // future / subjunctive are hidden until expanded
    expect(screen.queryByText('hablaré')).not.toBeInTheDocument()
  })

  it('reveals the full paradigm when expanded', () => {
    render(<ConjugationTable conjugation={HABLAR} />)
    fireEvent.click(screen.getByRole('button', { name: /đầy đủ/i }))
    expect(screen.getByText('hablaré')).toBeInTheDocument() // future now shown
    expect(screen.getByText('no hables')).toBeInTheDocument() // imperative now shown
  })
})
