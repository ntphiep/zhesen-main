// test/wordlist-client.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WordlistClient } from '@/components/wordlist/WordlistClient'
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
    audioUrl: null, notes: null, status: 'new', tags: [], createdAt: '2026-06-19T00:00:00Z', updatedAt: 'x', ...over,
  }
}

beforeEach(() => {
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
    expect(screen.queryByText('alpha')).not.toBeInTheDocument()
    expect(screen.queryByText('beta')).not.toBeInTheDocument()
    expect(deleteWords).toHaveBeenCalledWith(expect.anything(), expect.arrayContaining(['x', 'y']))
  })

  // 400+ rows is a real wordlist, and every row mounts an audio button and a
  // row-actions group. Rendering all of them stalled visibly on each keystroke
  // in the filter box, so the table shows a page at a time.
  it('shows one page of a long list, and more on request', async () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      mk(`w${i}`, { headword: `word${i}`, entryId: `en:word${i}` }))
    render(<WordlistClient initialWords={many} />)

    expect(screen.getByText('word0')).toBeInTheDocument()
    expect(screen.queryByText('word60')).toBeNull()
    expect(screen.getByText(/Đang xem 50 \/ 120 từ/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Xem thêm' }))
    expect(screen.getByText('word60')).toBeInTheDocument()
    expect(screen.queryByText('word110')).toBeNull()
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

  // A narrower filter must not leave the reader on page three of the old list.
  it('returns to the first page when the filter changes', async () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      mk(`w${i}`, { headword: `word${i}`, entryId: `en:word${i}` }))
    render(<WordlistClient initialWords={many} />)
    await userEvent.click(screen.getByRole('button', { name: 'Xem thêm' }))
    expect(screen.getByText('word60')).toBeInTheDocument()

    await userEvent.type(screen.getByPlaceholderText(/Tìm trong danh sách/i), 'word')
    expect(screen.getByText(/Đang xem 50 \/ 120 từ/)).toBeInTheDocument()
    expect(screen.queryByText('word60')).toBeNull()
  })

  // Promise.all rejected on the first failure while the rest were already in
  // flight and landed anyway: 199 of 200 rows tagged in the database, the whole
  // list rolled back on screen, and an alert saying it had failed. The learner
  // then filtered by that tag and found words the app said were not tagged.
  it('keeps the tags that saved when one row fails', async () => {
    const alerts: string[] = []
    vi.stubGlobal('alert', (m: string) => alerts.push(m))
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
    await userEvent.type(screen.getByPlaceholderText(/Gắn thẻ/i), 'toeic')
    await userEvent.click(screen.getByRole('button', { name: 'Gắn thẻ' }))

    // The two that saved keep the tag; only the one that failed goes back.
    expect(await screen.findAllByText('toeic')).toHaveLength(2)
    expect(alerts.join(' ')).toMatch(/1 từ/)
  })

  it('keeps every tag when nothing fails', async () => {
    const words = [mk('w1', { headword: 'alpha' }), mk('w2', { headword: 'beta' })]
    updateWord.mockImplementation(async (_c: unknown, id: string, patch: Partial<UserWord>) =>
      ({ ...words.find((w) => w.id === id)!, ...patch }))
    render(<WordlistClient initialWords={words} />)

    await userEvent.click(screen.getByLabelText('Chọn tất cả'))
    await userEvent.type(screen.getByPlaceholderText(/Gắn thẻ/i), 'toeic')
    await userEvent.click(screen.getByRole('button', { name: 'Gắn thẻ' }))

    expect(await screen.findAllByText('toeic')).toHaveLength(2)
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
})
