import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddToWordlistButton } from '@/components/lookup/AddToWordlistButton'
import { rememberPendingSave } from '@/lib/wordlist/pendingSave'
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
  // A saved word must show as already-saved before any click; offering the add
  // again invites a click that cannot succeed.
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
    const link = await screen.findByRole('link', { name: /Thêm vào sổ tay/i })
    expect(link).toHaveAttribute('href', '/register?next=%2Fdictionary%2Fen%2Fdog')
    expect(addWordMock).not.toHaveBeenCalled()
  })

  // A word tapped in a passage comes back to the passage, which `?q=` restores.
  it('sends a guest who saves from a sentence back to the page they were reading', async () => {
    window.history.replaceState(null, '', '/dictionary?q=the%20dog')
    client.auth.getSession.mockResolvedValueOnce({ data: { session: null } })
    render(<AddToWordlistButton entry={entry} context={{ text: 'the dog', translationVi: null }} />)
    const link = await screen.findByRole('link', { name: /Thêm vào sổ tay/i })
    expect(link).toHaveAttribute('href', `/register?next=${encodeURIComponent('/dictionary?q=the%20dog')}`)
    window.history.replaceState(null, '', '/')
  })

  // Most guests have no account, so the save leads to /register and the entry waits in
  // this tab until they come back.
  it('remembers the entry a guest pressed save on', async () => {
    client.auth.getSession.mockResolvedValueOnce({ data: { session: null } })
    render(<AddToWordlistButton entry={entry} />)
    fireEvent.click(await screen.findByRole('link', { name: /Thêm vào sổ tay/i }))
    expect(JSON.parse(sessionStorage.getItem('zhesen:pending-save') ?? 'null')).toMatchObject({ id: 'en:dog' })
  })
})

describe('AddToWordlistButton, back from registering', () => {
  beforeEach(() => {
    sessionStorage.clear()
    addWordMock.mockReset()
    addWordMock.mockResolvedValue({})
  })

  it('saves the remembered entry once, then clears it', async () => {
    rememberPendingSave('en:dog')
    const first = render(<AddToWordlistButton entry={entry} />)
    expect(await screen.findByText('Đã thêm')).toBeInTheDocument()
    expect(addWordMock).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem('zhesen:pending-save')).toBeNull()

    first.unmount()
    render(<AddToWordlistButton entry={entry} />)
    expect(await screen.findByRole('button', { name: /Thêm vào sổ tay/i })).toBeEnabled()
    expect(addWordMock).toHaveBeenCalledTimes(1)
  })

  it('ignores an entry remembered more than 30 minutes ago', async () => {
    rememberPendingSave('en:dog', Date.now() - 31 * 60 * 1000)
    render(<AddToWordlistButton entry={entry} />)
    expect(await screen.findByRole('button', { name: /Thêm vào sổ tay/i })).toBeEnabled()
    expect(addWordMock).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('zhesen:pending-save')).toBeNull()
  })

  it('leaves another entry pending for its own page', async () => {
    rememberPendingSave('en:cat')
    render(<AddToWordlistButton entry={entry} />)
    expect(await screen.findByRole('button', { name: /Thêm vào sổ tay/i })).toBeEnabled()
    await waitFor(() => expect(isWordSavedMock).toHaveBeenCalled())
    expect(addWordMock).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('zhesen:pending-save')).toContain('en:cat')
  })
})
