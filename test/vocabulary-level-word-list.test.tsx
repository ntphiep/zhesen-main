import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LevelWordList } from '@/components/vocabulary/LevelWordList'
import type { DictEntryPreview } from '@/lib/dictionary/types'
import type { Language } from '@/lib/languages'

// The add-all button reads the account, so the client stub carries a signed-in
// user; the import inside the factory settles before the stub is built.
vi.mock('@/lib/supabase/client', async () => {
  const { accountAuthStub } = await import('./helpers/supabase')
  return { createClient: () => accountAuthStub({ id: 'u1', email: 'a@b.com' }) }
})

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
    expect(getEntriesByLevel).toHaveBeenCalledWith(expect.anything(), 'en', 'A1', 1, 1)
    expect(await screen.findByText('b')).toBeInTheDocument()
  })

  // en:B2 holds 2,330 words: at 40 a page its end took 58 presses of "load more".
  it('jumps straight to a page, then loads more from there', async () => {
    getEntriesByLevel.mockResolvedValueOnce({ items: [entry('m')], total: 3 })
    getEntriesByLevel.mockResolvedValueOnce({ items: [entry('z')], total: 3 })
    render(<LevelWordList language={en} level="A1" levelIsEstimated={false} initialItems={[entry('a')]} total={4} pageSize={1} />)

    const pager = screen.getByRole('combobox', { name: 'Chuyển tới trang' })
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['1', '2', '3', '4'])
    await userEvent.selectOptions(pager, '3')

    expect(getEntriesByLevel).toHaveBeenCalledWith(expect.anything(), 'en', 'A1', 2, 1)
    expect(await screen.findByText('m')).toBeInTheDocument()
    expect(screen.queryByText('a')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Tải thêm/i }))
    expect(getEntriesByLevel).toHaveBeenLastCalledWith(expect.anything(), 'en', 'A1', 3, 1)
    expect(await screen.findByText('z')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Tải thêm/i })).not.toBeInTheDocument()
  })

  it('links the previous and next pages as ?page=N for a reader without the script', () => {
    render(<LevelWordList language={en} level="A1" levelIsEstimated={false} initialItems={[entry('m')]} initialStart={2} total={4} pageSize={1} />)
    expect(screen.getByRole('link', { name: /Trang trước/ })).toHaveAttribute('href', '/theory/en/vocabulary/A1?page=2')
    expect(screen.getByRole('link', { name: /Trang sau/ })).toHaveAttribute('href', '/theory/en/vocabulary/A1?page=4')
    expect(screen.getByRole('combobox', { name: 'Chuyển tới trang' })).toHaveValue('3')
  })

  it('points page 2 back at the level itself, not ?page=1', () => {
    render(<LevelWordList language={en} level="A1" levelIsEstimated={false} initialItems={[entry('b')]} initialStart={1} total={2} pageSize={1} />)
    expect(screen.getByRole('link', { name: /Trang trước/ })).toHaveAttribute('href', '/theory/en/vocabulary/A1')
    expect(screen.queryByRole('link', { name: /Trang sau/ })).not.toBeInTheDocument()
  })

  it('shows no pager when the level fits on one page', () => {
    render(<LevelWordList language={en} level="A1" levelIsEstimated={false} initialItems={[entry('a')]} total={1} pageSize={40} />)
    expect(screen.queryByRole('combobox', { name: 'Chuyển tới trang' })).not.toBeInTheDocument()
  })

  it('"add all" skips entries already saved and reports the counts', async () => {
    getAllEntriesByLevel.mockResolvedValueOnce([entry('a'), entry('b'), entry('c')])
    listSavedEntryIds.mockResolvedValueOnce(new Set(['en:b']))
    addWords.mockResolvedValueOnce([{ id: '1' }, { id: '2' }])
    render(<LevelWordList language={en} level="A1" levelIsEstimated={false} initialItems={[]} total={3} pageSize={40} />)

    await userEvent.click(await screen.findByRole('button', { name: /Thêm cả A1/i }))

    expect(await screen.findByText(/Đã thêm 2 từ/)).toBeInTheDocument()
    expect(screen.getByText(/bỏ qua 1 từ đã có/)).toBeInTheDocument()
    expect(addWords).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({ headword: 'a' }),
      expect.objectContaining({ headword: 'c' }),
    ])
  })

  it('"add all" does not call addWords when every entry is already saved', async () => {
    getAllEntriesByLevel.mockResolvedValueOnce([entry('a')])
    listSavedEntryIds.mockResolvedValueOnce(new Set(['en:a']))
    render(<LevelWordList language={en} level="A1" levelIsEstimated={false} initialItems={[]} total={1} pageSize={40} />)

    await userEvent.click(await screen.findByRole('button', { name: /Thêm cả A1/i }))

    expect(await screen.findByText(/Đã thêm 0 từ/)).toBeInTheDocument()
    expect(addWords).not.toHaveBeenCalled()
  })

  // The read of what is already saved cannot see a write still in flight -- from
  // another tab, or an impatient second click on this button. Rows that come
  // back skipped must not be counted as inserted.
  it('"add all" counts what was inserted, not what it hoped to insert', async () => {
    getAllEntriesByLevel.mockResolvedValueOnce([entry('a'), entry('b'), entry('c')])
    listSavedEntryIds.mockResolvedValueOnce(new Set())
    addWords.mockResolvedValueOnce([{ id: '1' }])
    render(<LevelWordList language={en} level="A1" levelIsEstimated={false} initialItems={[]} total={3} pageSize={40} />)

    await userEvent.click(await screen.findByRole('button', { name: /Thêm cả A1/i }))

    expect(await screen.findByText(/Đã thêm 1 từ/)).toBeInTheDocument()
    expect(screen.getByText(/bỏ qua 2 từ đã có/)).toBeInTheDocument()
  })
})
