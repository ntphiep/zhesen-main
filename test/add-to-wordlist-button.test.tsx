import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddToWordlistButton } from '@/components/lookup/AddToWordlistButton'
import type { DictEntryPreview } from '@/lib/dictionary/types'

// A signed-in account by default; the anonymous door has its own test. Built in
// vi.hoisted because the mock factory runs before module imports settle.
const client = vi.hoisted(() => {
  const user = { id: 'u1', email: 'a@b.com' }
  return {
    auth: {
      getSession: vi.fn(async (): Promise<{ data: { session: { user: { id: string; email?: string } } | null } }> => ({ data: { session: { user } } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: () => {} } } })),
    },
  }
})
vi.mock('@/lib/supabase/client', () => ({ createClient: () => client }))

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
    await userEvent.click(await screen.findByRole('button', { name: /Thêm vào sổ tay/i }))
    expect(await screen.findByText(/Đã có trong sổ tay/i)).toBeInTheDocument()
  })

  it('shows a retry error for any other failure', async () => {
    addWordMock.mockRejectedValueOnce(new Error('network'))
    render(<AddToWordlistButton entry={entry} />)
    await userEvent.click(await screen.findByRole('button', { name: /Thêm vào sổ tay/i }))
    expect(await screen.findByText(/thử lại/i)).toBeInTheDocument()
  })

  // The notebook belongs to an account. A visitor without one is not silently
  // saved into an anonymous cookie -- they are pointed at the door, carrying the
  // word's own page back so the save is one step away after signing in.
  it('asks a signed-out visitor to sign in instead of saving', async () => {
    addWordMock.mockClear()
    client.auth.getSession.mockResolvedValueOnce({ data: { session: null } })
    render(<AddToWordlistButton entry={entry} />)
    const link = await screen.findByRole('link', { name: /Đăng nhập để lưu/i })
    expect(link).toHaveAttribute('href', '/login?next=%2Fdictionary%2Fen%2Fdog')
    expect(addWordMock).not.toHaveBeenCalled()
  })
})
