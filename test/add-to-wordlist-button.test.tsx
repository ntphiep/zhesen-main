import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddToWordlistButton } from '@/components/lookup/AddToWordlistButton'
import type { DictEntryPreview } from '@/lib/dictionary/types'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

const { addWordMock, isWordSavedMock } = vi.hoisted(() => ({
  addWordMock: vi.fn(),
  isWordSavedMock: vi.fn(async () => false),
}))

vi.mock('@/lib/wordlist/store', async (orig) => {
  const actual = (await orig()) as typeof import('@/lib/wordlist/store')
  return { ...actual, addWord: addWordMock, isWordSaved: isWordSavedMock }
})

const entry: DictEntryPreview = {
  id: 'en:dog', lang: 'en', headword: 'dog', traditional: null, level: 'A1',
  ipa: '/dɔːɡ/', pos: 'noun', glossVi: 'con chó', glossEn: 'dog', audioUrl: null,
}

describe('AddToWordlistButton', () => {
  // Reopening a saved word used to offer the add again, and said so only after a
  // click that could not succeed.
  it('says the word is already saved before it is clicked', async () => {
    isWordSavedMock.mockResolvedValueOnce(true)
    render(<AddToWordlistButton entry={entry} />)
    expect(await screen.findByText(/Đã có trong sổ tay/i)).toBeInTheDocument()
    expect(screen.getByRole('button')).toBeDisabled()
    expect(addWordMock).not.toHaveBeenCalled()
  })

  it('offers the add for a word that is not saved', async () => {
    render(<AddToWordlistButton entry={entry} />)
    expect(await screen.findByRole('button', { name: /Thêm vào sổ tay/i })).toBeEnabled()
  })

  it('shows "Đã có trong sổ tay" when the entry is already saved', async () => {
    const { WordAlreadyExistsError } = await import('@/lib/wordlist/store')
    addWordMock.mockRejectedValueOnce(new WordAlreadyExistsError('en:dog'))
    render(<AddToWordlistButton entry={entry} />)
    await userEvent.click(screen.getByRole('button', { name: /Thêm vào sổ tay/i }))
    expect(await screen.findByText(/Đã có trong sổ tay/i)).toBeInTheDocument()
  })

  it('shows a retry error for any other failure', async () => {
    addWordMock.mockRejectedValueOnce(new Error('network'))
    render(<AddToWordlistButton entry={entry} />)
    await userEvent.click(screen.getByRole('button', { name: /Thêm vào sổ tay/i }))
    expect(await screen.findByText(/thử lại/i)).toBeInTheDocument()
  })
})
