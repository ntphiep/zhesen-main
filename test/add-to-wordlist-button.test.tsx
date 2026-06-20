import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddToWordlistButton } from '@/components/lookup/AddToWordlistButton'
import type { DictEntryPreview } from '@/lib/dictionary/types'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

const { addWordMock } = vi.hoisted(() => ({ addWordMock: vi.fn() }))

vi.mock('@/lib/wordlist/store', async (orig) => {
  const actual = (await orig()) as typeof import('@/lib/wordlist/store')
  return { ...actual, addWord: addWordMock }
})

const entry: DictEntryPreview = {
  id: 'en:dog', lang: 'en', headword: 'dog', traditional: null, level: 'A1',
  ipa: '/dɔːɡ/', pos: 'noun', glossVi: 'con chó', glossEn: 'dog', audioUrl: null,
}

describe('AddToWordlistButton', () => {
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
