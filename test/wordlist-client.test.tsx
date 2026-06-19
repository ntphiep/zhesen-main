// test/wordlist-client.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WordlistClient } from '@/app/wordlist/WordlistClient'
import type { UserWord } from '@/lib/wordlist/types'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

// Use vi.hoisted so these are initialized before vi.mock factory runs
const { addWord, deleteWord, deleteWords, updateWord } = vi.hoisted(() => ({
  addWord: vi.fn(),
  deleteWord: vi.fn(async () => {}),
  deleteWords: vi.fn(async () => {}),
  updateWord: vi.fn(),
}))

vi.mock('@/lib/wordlist/store', async (orig) => ({
  ...(await orig()),
  addWord,
  deleteWord,
  deleteWords,
  updateWord,
}))

function mk(id: string, over: Partial<UserWord> = {}): UserWord {
  return {
    id, lang: 'en', entryId: 'en:dog', headword: 'dog', reading: null, ipa: '/dɔːɡ/', pos: 'noun',
    meaningVi: 'con chó', meaningEn: 'dog', level: 'A1', example: 'The dog barked.', exampleTranslation: 'Con chó sủa.',
    audioUrl: null, notes: null, status: 'new', tags: [], createdAt: '2026-06-19T00:00:00Z', updatedAt: 'x', ...over,
  }
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn()
  HTMLDialogElement.prototype.close = vi.fn()
  vi.stubGlobal('confirm', () => true)
  vi.clearAllMocks()
  // Re-set default implementations after clearAllMocks
  addWord.mockImplementation(async (_c: unknown, d: { headword: string; meaningVi: string | null; entryId: string | null; lang: string }) =>
    ({ ...mk('new-id'), headword: d.headword, meaningVi: d.meaningVi, entryId: d.entryId, lang: d.lang }))
  deleteWord.mockResolvedValue(undefined)
  deleteWords.mockResolvedValue(undefined)
  updateWord.mockImplementation(async (_c: unknown, id: string, p: Partial<UserWord>) => ({ ...mk(id), ...p }))
})

describe('WordlistClient', () => {
  it('renders rows with key columns', () => {
    render(<WordlistClient initialWords={[mk('a', { headword: 'forward', meaningVi: 'chuyển tiếp' })]} />)
    expect(screen.getByText('forward')).toBeInTheDocument()
    expect(screen.getByText('chuyển tiếp')).toBeInTheDocument()
  })

  it('filters by search query', async () => {
    render(<WordlistClient initialWords={[mk('a', { headword: 'forward' }), mk('b', { headword: 'recipient' })]} />)
    await userEvent.type(screen.getByPlaceholderText(/Tìm trong danh sách/i), 'forward')
    expect(screen.getByText('forward')).toBeInTheDocument()
    expect(screen.queryByText('recipient')).not.toBeInTheDocument()
  })

  it('deletes a word optimistically', async () => {
    render(<WordlistClient initialWords={[mk('a', { headword: 'forward' })]} />)
    await userEvent.click(screen.getByRole('button', { name: /Xóa từ forward/i }))
    expect(screen.queryByText('forward')).not.toBeInTheDocument()
    expect(deleteWord).toHaveBeenCalledWith(expect.anything(), 'a')
  })

  it('shows empty state', () => {
    render(<WordlistClient initialWords={[]} />)
    expect(screen.getByText(/Chưa có từ nào/i)).toBeInTheDocument()
  })
})
