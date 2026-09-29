import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WordlistClient } from '@/components/wordlist/WordlistClient'
import { resetStoredPrefCache } from '@/lib/hooks/useStoredPref'
import type { UserWord } from '@/lib/wordlist/types'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

// Use vi.hoisted so these are initialized before vi.mock factory runs
const { addWord, addWords, listWords, deleteWord, deleteWords, updateWord } = vi.hoisted(() => ({
  addWord: vi.fn(),
  addWords: vi.fn(),
  listWords: vi.fn(),
  deleteWord: vi.fn(async () => {}),
  deleteWords: vi.fn(async () => {}),
  updateWord: vi.fn(),
}))

vi.mock('@/lib/wordlist/store', async (orig) => ({
  ...(await orig<typeof import('@/lib/wordlist/store')>()),
  addWord,
  addWords,
  listWords,
  deleteWord,
  deleteWords,
  updateWord,
}))

function mk(id: string, over: Partial<UserWord> = {}): UserWord {
  return {
    id, lang: 'en', entryId: 'en:dog', headword: 'dog', reading: null, ipa: '/dɔːɡ/', pos: 'noun',
    meaningVi: 'con chó', meaningEn: 'dog', level: 'A1', example: 'The dog barked.', exampleTranslation: 'Con chó sủa.',
    audioUrl: null, notes: null, status: 'new', tags: [], createdAt: '2026-06-19T00:00:00Z', updatedAt: 'x', fsrsDueAt: '2026-01-01T00:00:00Z', fsrsLapses: 0, ...over,
  }
}

afterEach(() => {
  // A matchMedia stub set by one case must not decide the layout of the next.
  vi.restoreAllMocks()
})

beforeEach(() => {
  vi.clearAllMocks()
  // The page size and the column choice live in localStorage, so without this a case
  // inherits whatever the case before it picked.
  localStorage.clear()
  resetStoredPrefCache()
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
    await userEvent.type(screen.getByPlaceholderText(/Tìm trong sổ tay/i), 'forward')
    expect(screen.getByText('forward')).toBeInTheDocument()
    expect(screen.queryByText('recipient')).not.toBeInTheDocument()
  })

  it('deletes a word optimistically once the deletion is confirmed', async () => {
    render(<WordlistClient initialWords={[mk('a', { headword: 'forward' })]} />)
    await userEvent.click(screen.getByRole('button', { name: /Xóa từ forward/i }))
    // The row is still there until the dialog is answered.
    expect(screen.getByText('forward')).toBeInTheDocument()
    expect(deleteWord).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Xóa' }))
    expect(screen.queryByText('forward')).not.toBeInTheDocument()
    expect(deleteWord).toHaveBeenCalledWith(expect.anything(), 'a')
  })

  it('keeps a selected word selected when its deletion fails', async () => {
    deleteWord.mockRejectedValueOnce(new Error('offline'))
    render(<WordlistClient initialWords={[mk('a', { headword: 'forward' })]} />)
    await userEvent.click(screen.getByLabelText('Chọn từ forward'))
    await userEvent.click(screen.getByRole('button', { name: /Xóa từ forward/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Xóa' }))
    expect(await screen.findByText('forward')).toBeInTheDocument()
    expect(screen.getByLabelText('Chọn từ forward')).toBeChecked()
  })

  it('keeps the word when the deletion is cancelled', async () => {
    render(<WordlistClient initialWords={[mk('a', { headword: 'forward' })]} />)
    await userEvent.click(screen.getByRole('button', { name: /Xóa từ forward/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }))
    expect(screen.getByText('forward')).toBeInTheDocument()
    expect(deleteWord).not.toHaveBeenCalled()
  })

  it('shows empty state', () => {
    render(<WordlistClient initialWords={[]} />)
    expect(screen.getByText(/Chưa có từ\./i)).toBeInTheDocument()
  })

  it('optimistic add: new row appears immediately and addWord is called', async () => {
    render(<WordlistClient initialWords={[]} />)
    // Open the dialog
    await userEvent.click(screen.getByRole('button', { name: /Thêm từ/i }))
    // Switch to manual tab so we can fill the form without a DB search
    await userEvent.click(screen.getByRole('tab', { name: /Thủ công/i }))
    await userEvent.type(screen.getByPlaceholderText(/Ví dụ: dog/i), 'hello')
    await userEvent.click(screen.getByRole('button', { name: /Lưu từ/i }))
    // Optimistic row should appear before the async addWord resolves
    expect(await screen.findByText('hello')).toBeInTheDocument()
    expect(addWord).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ headword: 'hello' }))
  })

  it('bulk delete: removes selected rows and calls deleteWords with their ids', async () => {
    render(<WordlistClient initialWords={[mk('x', { headword: 'alpha' }), mk('y', { headword: 'beta' })]} />)
    // Select all via select-all checkbox
    await userEvent.click(screen.getByLabelText(/Chọn tất cả/i))
    // Bulk delete button should be visible now
    await userEvent.click(screen.getByRole('button', { name: /Xóa đã chọn/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Xóa 2 từ' }))
    expect(screen.queryByText('alpha')).not.toBeInTheDocument()
    expect(screen.queryByText('beta')).not.toBeInTheDocument()
    expect(deleteWords).toHaveBeenCalledWith(expect.anything(), expect.arrayContaining(['x', 'y']))
  })

  // 400+ rows is a real wordlist, and every row mounts an audio button and a
  // row-actions group. Rendering all of them stalled visibly on each keystroke
  // in the filter box, so the table shows a page at a time.
  it('shows one page of a long list, and walks to the others', async () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      mk(`w${i}`, { headword: `word${i}`, entryId: `en:word${i}` }))
    render(<WordlistClient initialWords={many} />)

    expect(screen.getByText('word0')).toBeInTheDocument()
    expect(screen.queryByText('word60')).toBeNull()
    expect(screen.getByText('1-50 trong 120 từ')).toBeInTheDocument()
    expect(screen.getByText('Trang 1 / 3')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Trang sau' }))
    expect(screen.getByText('word60')).toBeInTheDocument()
    expect(screen.queryByText('word0')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Trang cuối' }))
    expect(screen.getByText('101-120 trong 120 từ')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled()
  })

  it('shows more rows per page on request', async () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      mk(`w${i}`, { headword: `word${i}`, entryId: `en:word${i}` }))
    render(<WordlistClient initialWords={many} />)

    await userEvent.selectOptions(screen.getByLabelText('Số từ mỗi trang'), '100')
    expect(screen.getByText('1-100 trong 120 từ')).toBeInTheDocument()
    // One row per word plus the header row.
    expect(screen.getAllByRole('row')).toHaveLength(101)
  })

  // Hiding a column must take its cells with it, and the choice is remembered per browser.
  it('hides a column the reader turned off', async () => {
    render(<WordlistClient initialWords={[mk('w1', { headword: 'alpha', level: 'A1' })]} />)
    expect(screen.getByRole('columnheader', { name: /Trình độ/ })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^Cột/ }))
    await userEvent.click(screen.getByLabelText('Hiện cột Trình độ'))
    expect(screen.queryByRole('columnheader', { name: /Trình độ/ })).toBeNull()
  })

  // A dropdown that covers the table it configures has to close the way every other
  // dropdown does.
  it('closes the column menu on Escape and on a click outside it', async () => {
    render(<WordlistClient initialWords={[mk('w1', { headword: 'alpha' })]} />)
    await userEvent.click(screen.getByRole('button', { name: /^Cột/ }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: /^Cột/ }))
    await userEvent.click(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes the export menu on Escape and on a click outside it', async () => {
    render(<WordlistClient initialWords={[mk('w1', { headword: 'alpha' })]} />)
    const trigger = screen.getByRole('button', { name: /^Xuất/ })
    await userEvent.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(trigger)
    await userEvent.click(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  // A phone holds one column at the left edge whatever is pinned, so a pin control
  // there would spend the reader's three slots on nothing.
  it('offers no pinning on a phone', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((media: string) => ({
      matches: media.includes('max-width'), media, onchange: null,
      addListener() {}, removeListener() {},
      addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
    }) as MediaQueryList)
    render(<WordlistClient initialWords={[mk('w1', { headword: 'alpha' })]} />)

    await userEvent.click(screen.getByRole('button', { name: /^Cột/ }))
    expect(screen.getByLabelText('Hiện cột Trình độ')).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Ghim cột/)).toBeNull()
    expect(screen.queryByLabelText(/^Bỏ ghim cột/)).toBeNull()
  })

  // Selecting all then acting on the selection must cover the whole filtered
  // list, not only the rows the pager happens to have rendered.
  it('selects every filtered word, not just the page on screen', async () => {
    const many = Array.from({ length: 70 }, (_, i) =>
      mk(`w${i}`, { headword: `word${i}`, entryId: `en:word${i}` }))
    render(<WordlistClient initialWords={many} />)
    await userEvent.click(screen.getByLabelText('Chọn tất cả'))
    expect(screen.getByText('70 từ đã chọn')).toBeInTheDocument()
  })

  it('does not count or delete a selected word the filter hides', async () => {
    render(<WordlistClient initialWords={[mk('x', { headword: 'alpha' }), mk('y', { headword: 'beta' })]} />)
    await userEvent.click(screen.getByLabelText('Chọn từ alpha'))
    await userEvent.click(screen.getByLabelText('Chọn từ beta'))
    await userEvent.type(screen.getByPlaceholderText(/Tìm trong sổ tay/i), 'beta')

    await userEvent.click(screen.getByRole('button', { name: 'Xóa đã chọn (1)' }))
    await userEvent.click(screen.getByRole('button', { name: 'Xóa 1 từ' }))
    expect(deleteWords).toHaveBeenCalledWith(expect.anything(), ['y'])

    await userEvent.clear(screen.getByPlaceholderText(/Tìm trong sổ tay/i))
    expect(screen.getByText('alpha')).toBeInTheDocument()
    expect(screen.getByLabelText('Chọn từ alpha')).toBeChecked()
  })

  // A hidden selection is not one the reader can see, so the header box ignores it too.
  it('leaves the select-all box clear when only a hidden word is selected', async () => {
    render(<WordlistClient initialWords={[mk('x', { headword: 'alpha' }), mk('y', { headword: 'beta' })]} />)
    await userEvent.click(screen.getByLabelText('Chọn từ alpha'))
    await userEvent.type(screen.getByPlaceholderText(/Tìm trong sổ tay/i), 'beta')
    const all = screen.getByLabelText<HTMLInputElement>('Chọn tất cả')
    expect(all.indeterminate).toBe(false)
    expect(all).not.toBeChecked()
  })

  it('offers no bulk delete once the filter hides every selected word', async () => {
    render(<WordlistClient initialWords={[mk('x', { headword: 'alpha' })]} />)
    await userEvent.click(screen.getByLabelText('Chọn từ alpha'))
    await userEvent.type(screen.getByPlaceholderText(/Tìm trong sổ tay/i), 'zzz')
    expect(screen.queryByRole('button', { name: /Xóa đã chọn/ })).toBeNull()
  })

  // A narrower filter must not leave the reader on page three of the old list.
  it('returns to the first page when the filter changes', async () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      mk(`w${i}`, { headword: `word${i}`, entryId: `en:word${i}` }))
    render(<WordlistClient initialWords={many} />)
    await userEvent.click(screen.getByRole('button', { name: 'Trang sau' }))
    expect(screen.getByText('word60')).toBeInTheDocument()

    await userEvent.type(screen.getByPlaceholderText(/Tìm trong sổ tay/i), 'word')
    expect(screen.getByText('1-50 trong 120 từ')).toBeInTheDocument()
    expect(screen.queryByText('word60')).toBeNull()
  })

  // Promise.all rejected on the first failure while the rest were already in
  // flight and landed anyway: 199 of 200 rows tagged in the database, the whole
  // list rolled back on screen, and a notice saying it had failed. The learner
  // then filtered by that tag and found words the app said were not tagged.
  it('keeps the tags that saved when one row fails', async () => {
    const words = [
      mk('w1', { headword: 'alpha', entryId: 'en:alpha' }),
      mk('w2', { headword: 'beta', entryId: 'en:beta' }),
      mk('w3', { headword: 'gamma', entryId: 'en:gamma' }),
    ]
    updateWord.mockImplementation(async (_c: unknown, id: string, patch: Partial<UserWord>) => {
      if (id === 'w2') throw new Error('offline')
      return { ...words.find((w) => w.id === id)!, ...patch }
    })
    render(<WordlistClient initialWords={words} />)

    await userEvent.click(screen.getByLabelText('Chọn tất cả'))
    await userEvent.type(screen.getByPlaceholderText(/Thẻ, cách nhau/i), 'toeic')
    await userEvent.click(screen.getByRole('button', { name: 'Gắn thẻ' }))

    // The two that saved keep the tag; only the one that failed goes back.
    expect(await screen.findAllByText('toeic')).toHaveLength(2)
    expect(await screen.findByRole('status')).toHaveTextContent(/1 từ/)
  })

  it('keeps every tag when nothing fails', async () => {
    const words = [mk('w1', { headword: 'alpha' }), mk('w2', { headword: 'beta' })]
    updateWord.mockImplementation(async (_c: unknown, id: string, patch: Partial<UserWord>) =>
      ({ ...words.find((w) => w.id === id)!, ...patch }))
    render(<WordlistClient initialWords={words} />)

    await userEvent.click(screen.getByLabelText('Chọn tất cả'))
    await userEvent.type(screen.getByPlaceholderText(/Thẻ, cách nhau/i), 'toeic')
    await userEvent.click(screen.getByRole('button', { name: 'Gắn thẻ' }))

    expect(await screen.findAllByText('toeic')).toHaveLength(2)
  })

  // The bar holds no form, so Enter in a box that looks like one used to do nothing.
  it('applies a tag typed and confirmed with Enter', async () => {
    const words = [mk('w1', { headword: 'alpha' })]
    updateWord.mockImplementation(async (_c: unknown, id: string, patch: Partial<UserWord>) =>
      ({ ...words.find((w) => w.id === id)!, ...patch }))
    render(<WordlistClient initialWords={words} />)

    await userEvent.click(screen.getByLabelText('Chọn tất cả'))
    await userEvent.type(screen.getByPlaceholderText(/Thẻ, cách nhau/i), 'toeic{Enter}')

    expect(await screen.findAllByText('toeic')).toHaveLength(1)
  })

  it('does not send an update when the edit changed nothing', async () => {
    render(<WordlistClient initialWords={[mk('w1', { headword: 'alpha' })]} />)
    await userEvent.click(screen.getByRole('button', { name: /Sửa từ alpha/i }))
    await userEvent.click(screen.getByRole('button', { name: /^Lưu/i }))
    expect(updateWord).not.toHaveBeenCalled()
  })

  // An import is chunked, so a failure part way through leaves the earlier
  // chunks written. Reporting "không nhập được" over a list still showing the
  // old words told the learner the opposite of the truth, and their next move
  // was to import the same file again.
  it('shows what the database holds even when the import fails part way', async () => {
    const before = mk('w1', { headword: 'alpha', entryId: 'en:alpha' })
    const written = [before, mk('w2', { headword: 'beta', entryId: 'en:beta' })]
    addWords.mockRejectedValue(new Error('mất mạng ở lô thứ ba'))
    listWords.mockResolvedValue(written)
    render(<WordlistClient initialWords={[before]} />)

    await userEvent.click(screen.getByRole('button', { name: 'Nhập CSV' }))
    const NL = String.fromCharCode(10)
    const csv = [
      'headword,lang,entryId,reading,ipa,pos,meaningVi,meaningEn,level,example,exampleTranslation,audioUrl,notes,status,tags,createdAt',
      'beta,en,en:beta,,,,con beta,,,,,,,new,,',
    ].join(NL)
    await userEvent.upload(
      screen.getByLabelText(/Chọn file CSV/i),
      new File([csv], 'wordlist.csv', { type: 'text/csv' }),
    )
    await userEvent.click(await screen.findByRole('button', { name: /Nhập 1 từ/i }))

    // addWords rejected, yet the row the database kept is on screen.
    await waitFor(() => expect(listWords).toHaveBeenCalled())
    expect(await screen.findByText('beta')).toBeInTheDocument()
  })

  // A word saved from the dictionary keeps its pinyin in `ipa`; `reading` is set only
  // when the entry carries a separate one.
  it('shows the pinyin of a Chinese word on its grid card', async () => {
    render(<WordlistClient initialWords={[mk('z1', { lang: 'zh', entryId: 'zh:天气', headword: '天气', reading: null, ipa: 'tiānqì' })]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Xem dạng lưới' }))
    expect(screen.getByText('tiānqì')).toBeInTheDocument()
  })
})
