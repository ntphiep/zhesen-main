import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LevelWordList } from '@/components/learn/LevelWordList'
import type { DictEntryPreview } from '@/lib/dictionary/types'
import type { Language } from '@/lib/languages'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

const { getEntriesByLevel, getAllEntriesByLevel, addWords, listSavedEntryIds } = vi.hoisted(() => ({
  getEntriesByLevel: vi.fn(),
  getAllEntriesByLevel: vi.fn(),
  addWords: vi.fn(),
  listSavedEntryIds: vi.fn(),
}))

vi.mock('@/lib/dictionary/levels', () => ({ getEntriesByLevel, getAllEntriesByLevel }))
vi.mock('@/lib/wordlist/store', async (orig) => ({ ...(await orig()), addWords, listSavedEntryIds }))

const en: Language = { code: 'en', name: 'Tiếng Anh', nativeName: 'English', script: 'latin' }

function entry(headword: string): DictEntryPreview {
  return {
    id: `en:${headword}`, lang: 'en', headword, traditional: null, level: 'A1',
    ipa: null, pos: null, glossVi: null, glossEn: null, audioUrl: null,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('LevelWordList', () => {
  it('shows the estimated-level disclaimer only when levelIsEstimated is true', () => {
    const { rerender } = render(
      <LevelWordList language={en} level="A1" levelIsEstimated initialItems={[]} total={0} pageSize={40} />,
    )
    expect(screen.getByText(/ước lượng/i)).toBeInTheDocument()
    rerender(<LevelWordList language={en} level="A1" levelIsEstimated={false} initialItems={[]} total={0} pageSize={40} />)
    expect(screen.queryByText(/ước lượng/i)).not.toBeInTheDocument()
  })

  it('"load more" appends the next page fetched from the client-side query', async () => {
    getEntriesByLevel.mockResolvedValueOnce({ items: [entry('b')], total: 2 })
    render(<LevelWordList language={en} level="A1" levelIsEstimated={false} initialItems={[entry('a')]} total={2} pageSize={1} />)
    expect(screen.getByText('a')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Tải thêm/i }))
    expect(getEntriesByLevel).toHaveBeenCalledWith({}, 'en', 'A1', 1, 1)
    expect(await screen.findByText('b')).toBeInTheDocument()
  })

  it('"add all" skips entries already saved and reports the counts', async () => {
    getAllEntriesByLevel.mockResolvedValueOnce([entry('a'), entry('b'), entry('c')])
    listSavedEntryIds.mockResolvedValueOnce(new Set(['en:b']))
    addWords.mockResolvedValueOnce([{ id: '1' }, { id: '2' }])
    render(<LevelWordList language={en} level="A1" levelIsEstimated={false} initialItems={[]} total={3} pageSize={40} />)

    await userEvent.click(screen.getByRole('button', { name: /Thêm cả A1/i }))

    expect(await screen.findByText(/Đã thêm 2 từ/)).toBeInTheDocument()
    expect(screen.getByText(/bỏ qua 1 từ đã có/)).toBeInTheDocument()
    expect(addWords).toHaveBeenCalledWith({}, [
      expect.objectContaining({ headword: 'a' }),
      expect.objectContaining({ headword: 'c' }),
    ])
  })

  it('"add all" does not call addWords when every entry is already saved', async () => {
    getAllEntriesByLevel.mockResolvedValueOnce([entry('a')])
    listSavedEntryIds.mockResolvedValueOnce(new Set(['en:a']))
    render(<LevelWordList language={en} level="A1" levelIsEstimated={false} initialItems={[]} total={1} pageSize={40} />)

    await userEvent.click(screen.getByRole('button', { name: /Thêm cả A1/i }))

    expect(await screen.findByText(/Đã thêm 0 từ/)).toBeInTheDocument()
    expect(addWords).not.toHaveBeenCalled()
  })

  // The read of what is already saved cannot see a write still in flight -- from
  // another tab, or from an impatient second click on this very button. Those
  // rows come back skipped, and the count used to claim them anyway.
  it('"add all" counts what was inserted, not what it hoped to insert', async () => {
    getAllEntriesByLevel.mockResolvedValueOnce([entry('a'), entry('b'), entry('c')])
    listSavedEntryIds.mockResolvedValueOnce(new Set())
    addWords.mockResolvedValueOnce([{ id: '1' }])
    render(<LevelWordList language={en} level="A1" levelIsEstimated={false} initialItems={[]} total={3} pageSize={40} />)

    await userEvent.click(screen.getByRole('button', { name: /Thêm cả A1/i }))

    expect(await screen.findByText(/Đã thêm 1 từ/)).toBeInTheDocument()
    expect(screen.getByText(/bỏ qua 2 từ đã có/)).toBeInTheDocument()
  })
})
