import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditWordDialog } from '@/components/wordlist/EditWordDialog'
import { KNOWN_HINT, type UserWord } from '@/lib/wordlist/types'

const word: UserWord = {
  id: 'id1', lang: 'en', entryId: 'en:dog', headword: 'dog', reading: null, ipa: null, pos: 'noun',
  meaningVi: 'con chó', meaningEn: 'dog', level: 'A1', example: null, exampleTranslation: null,
  audioUrl: null, notes: null, status: 'new', tags: [], createdAt: 'x', updatedAt: 'x', fsrsDueAt: '2026-01-01T00:00:00Z', fsrsLapses: 0,
}

// "Đã biết" suspends the word from review and practice, so the control has to say so.
describe('setting "Đã biết"', () => {
  it('says the word leaves review, and how to bring it back', async () => {
    render(<EditWordDialog word={word} open onClose={() => {}} onSave={() => {}} />)
    expect(screen.queryByText(KNOWN_HINT)).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByRole('combobox'), 'known')
    expect(screen.getByText(KNOWN_HINT)).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByRole('combobox'), 'learning')
    expect(screen.queryByText(KNOWN_HINT)).not.toBeInTheDocument()
  })
})
