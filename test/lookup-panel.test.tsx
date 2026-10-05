import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LookupPanel } from '@/components/search/LookupPanel'
import { entryPath } from '@/lib/dictionary/entryId'
import { resetAiEnabledCache } from '@/lib/hooks/useAiEnabled'
import { callAi, aiEnabled } from '@/lib/ai/browser'
import type { DictEntryPreview } from '@/lib/dictionary/types'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
// AiSuggest (rendered on an empty result) has its own test file; kept disabled here so
// its `/api/ai` call never lands in the fetch mock this file asserts against.
vi.mock('@/lib/ai/browser', () => ({ callAi: vi.fn(), aiEnabled: vi.fn() }))

const EMPTY = { en: [], es: [], zh: [] }

function entry(overrides: Partial<DictEntryPreview> = {}): DictEntryPreview {
  return {
    id: 'en:dog', lang: 'en', headword: 'dog', traditional: null, level: null,
    ipa: null, pos: null, glossVi: null, glossEn: null, audioUrl: null,
    ...overrides,
  }
}

// Typed against `typeof fetch` so `fetchMock.mock.calls[0][0]` (the request URL) is a
// string, not the empty tuple a parameterless implementation would infer.
function stubFetch(body: unknown, ok = true) {
  const fetchMock = vi.fn<typeof fetch>(async () => ({ ok, json: async () => body }) as Response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  push.mockReset()
  localStorage.clear()
  vi.mocked(callAi).mockReset()
  vi.mocked(aiEnabled).mockReset().mockResolvedValue(false)
  resetAiEnabledCache()
})

describe('LookupPanel', () => {
  it('the vi panel asks the route for dir=vi', async () => {
    const fetchMock = stubFetch({ entries: EMPTY, suggestions: [] })
    render(<LookupPanel direction="vi" label="VN" />)
    // One word, not two: two words is a passage now, and a passage renders the
    // translation block instead of "Không tìm thấy từ nào."
    await userEvent.type(screen.getByLabelText('VN'), 'cho')
    await screen.findByText('Không tìm thấy từ nào.')
    expect(String(fetchMock.mock.calls[0][0])).toContain('dir=vi')
  })

  // Back from /register the page reads `?q=`, so the passage is still there.
  it('mirrors the query into the address, with the direction', async () => {
    window.history.replaceState(null, '', '/dictionary?lang=en')
    stubFetch({ entries: EMPTY, suggestions: [] })
    render(<LookupPanel direction="vi" label="VN" />)
    await userEvent.type(screen.getByLabelText('VN'), 'cho')
    await vi.waitFor(() => expect(window.location.search).toBe('?lang=en&q=cho&dir=vi'), { timeout: 2000 })
    await userEvent.clear(screen.getByLabelText('VN'))
    await vi.waitFor(() => expect(window.location.search).toBe('?lang=en'), { timeout: 2000 })
    window.history.replaceState(null, '', '/')
  })

  it('the fw panel does not send dir=vi', async () => {
    const fetchMock = stubFetch({ entries: EMPTY, suggestions: [] })
    render(<LookupPanel direction="fw" label="FW" />)
    await userEvent.type(screen.getByLabelText('FW'), 'dog')
    await screen.findByText('Không tìm thấy từ nào.')
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('dir=vi')
  })

  it('asks the search route nothing once the text is a passage', async () => {
    const fetchMock = stubFetch({ entries: EMPTY, suggestions: [] })
    render(<LookupPanel direction="vi" label="VN" />)
    const box = screen.getByLabelText('VN')
    await userEvent.type(box, 'cho')
    await screen.findByText('Không tìm thấy từ nào.')
    const afterOneWord = fetchMock.mock.calls.length
    expect(afterOneWord).toBeGreaterThan(0)

    await userEvent.type(box, ' con meo')
    expect(screen.queryByText('Không tìm thấy từ nào.')).toBeNull()
    const searches = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/dictionary/search'))
    expect(searches).toHaveLength(afterOneWord)
  })

  it('renders a result with its headword and Vietnamese gloss', async () => {
    stubFetch({ entries: { ...EMPTY, en: [entry({ glossVi: 'Con chó' })] }, suggestions: [] })
    render(<LookupPanel direction="fw" label="FW" />)
    await userEvent.type(screen.getByLabelText('FW'), 'dog')
    // findByText('dog') would match the textarea's own value, so wait on the gloss.
    expect(await screen.findByText('Con chó')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /dog/ })).toBeInTheDocument()
  })

  // Every Spanish level is estimated (30,616 of 30,616 rows); a plain B1 badge read as CEFR.
  it('draws an estimated level as an estimate, in its row and in the level filter', async () => {
    stubFetch({
      entries: { ...EMPTY, es: [
        entry({ id: 'es:perro', lang: 'es', headword: 'perro', level: 'A1', levelIsEstimated: true }),
        entry({ id: 'es:gato', lang: 'es', headword: 'gato', level: 'A2' }),
      ] },
      suggestions: [],
    })
    render(<LookupPanel direction="fw" label="FW" />)
    await userEvent.type(screen.getByLabelText('FW'), 'perro')
    const row = await screen.findByRole('link', { name: /perro/ })
    expect(row).toHaveTextContent('≈A1')
    expect(row).toHaveTextContent('ước lượng')
    expect(screen.getByRole('link', { name: /gato/ })).not.toHaveTextContent('ước lượng')
    expect(screen.getByRole('button', { name: /A1/ })).toHaveTextContent('≈A1')
    expect(screen.getByRole('button', { name: /A2/ })).not.toHaveTextContent('≈')
  })

  it('lists what the translation found after the native hits, marked with the translation', async () => {
    stubFetch({
      entries: { ...EMPTY, en: [entry({ id: 'en:field', headword: 'field', glossVi: 'Cánh đồng' })] },
      suggestions: [],
      translated: { en: { text: 'School', entries: [entry({ id: 'en:school', headword: 'school' })] } },
    })
    render(<LookupPanel direction="vi" label="VN" />)
    await userEvent.type(screen.getByLabelText('VN'), 'trường')
    expect(await screen.findByText('Dịch máy: School')).toBeInTheDocument()
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(links).toEqual([entryPath('en:field'), entryPath('en:school')])
    // Spanish and Chinese are empty; English is not, whatever the source of its rows.
    expect(screen.getAllByText('Chưa có từ khớp')).toHaveLength(2)
  })

  it('renders an empty result with suggestions as links to the entry, not refill buttons', async () => {
    stubFetch({
      entries: EMPTY,
      suggestions: [{ id: 'en:cot', lang: 'en', headword: 'cot', glossVi: 'Cái nôi', kind: 'headword' }],
    })
    render(<LookupPanel direction="fw" label="FW" />)
    await userEvent.type(screen.getByLabelText('FW'), 'cat')
    const link = await screen.findByRole('link', { name: /cot/ })
    expect(link).toHaveAttribute('href', entryPath('en:cot'))
    expect(screen.queryByRole('button', { name: /cot/ })).toBeNull()
  })

  it('renders the refusal the route sent, not a generic empty result', async () => {
    stubFetch({ error: 'Đang có quá nhiều lượt tra cứu. Vui lòng thử lại sau ít giây.' }, false)
    render(<LookupPanel direction="fw" label="FW" />)
    await userEvent.type(screen.getByLabelText('FW'), 'dog')
    expect(await screen.findByText('Đang có quá nhiều lượt tra cứu. Vui lòng thử lại sau ít giây.')).toBeInTheDocument()
    expect(screen.queryByText('Không tìm thấy từ nào.')).toBeNull()
  })

  it('retries a refused search with the same query', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Từ điển đang khởi động chậm.' }) } as Response)
      .mockResolvedValue({ ok: true, json: async () => ({ entries: { ...EMPTY, en: [entry({ glossVi: 'Con chó' })] }, suggestions: [] }) } as Response)
    vi.stubGlobal('fetch', fetchMock)
    render(<LookupPanel direction="fw" label="FW" />)
    await userEvent.type(screen.getByLabelText('FW'), 'dog')
    await screen.findByText('Từ điển đang khởi động chậm.')
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByText('Con chó')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toBe(String(fetchMock.mock.calls[0][0]))
  })

  it('reports a thrown search as a failure, not an empty result, and retries it', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue({ ok: true, json: async () => ({ entries: { ...EMPTY, en: [entry({ glossVi: 'Con chó' })] }, suggestions: [] }) } as Response)
    vi.stubGlobal('fetch', fetchMock)
    render(<LookupPanel direction="fw" label="FW" />)
    await userEvent.type(screen.getByLabelText('FW'), 'dog')
    expect(await screen.findByText('Chưa tra được.')).toBeInTheDocument()
    expect(screen.queryByText('Không tìm thấy từ nào.')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByText('Con chó')).toBeInTheDocument()
    expect(screen.queryByText('Chưa tra được.')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toBe(String(fetchMock.mock.calls[0][0]))
  })

  // The old failure beside "Đang dịch…" reads as the new query having failed already.
  it('clears the previous failure once a new query starts loading', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockReturnValue(new Promise<Response>(() => {}))
    vi.stubGlobal('fetch', fetchMock)
    render(<LookupPanel direction="fw" label="FW" />)
    await userEvent.type(screen.getByLabelText('FW'), 'dog')
    expect(await screen.findByText('Chưa tra được.')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('FW'), 's')
    expect(await screen.findByText('Đang dịch…')).toBeInTheDocument()
    expect(screen.queryByText('Chưa tra được.')).toBeNull()
  })

  it('shows language chips on both panels, naming the question each one answers', () => {
    stubFetch({ entries: EMPTY, suggestions: [] })
    const { unmount } = render(<LookupPanel direction="vi" label="VN" />)
    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
    expect(screen.getByRole('group', { name: 'Ngôn ngữ cần dịch sang' })).toBeInTheDocument()
    unmount()

    render(<LookupPanel direction="fw" label="FW" />)
    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
    expect(screen.getByRole('group', { name: 'Ngôn ngữ cần tìm' })).toBeInTheDocument()
  })

  it('keeps the language choice of each panel apart from the other', async () => {
    stubFetch({ entries: EMPTY, suggestions: [] })
    const { unmount } = render(<LookupPanel direction="fw" label="FW" />)
    await userEvent.click(screen.getByText('Tiếng Trung'))
    expect(screen.getAllByRole('checkbox').filter((c) => (c as HTMLInputElement).checked)).toHaveLength(2)
    unmount()

    render(<LookupPanel direction="vi" label="VN" />)
    expect(screen.getAllByRole('checkbox').filter((c) => (c as HTMLInputElement).checked)).toHaveLength(3)
  })

  it('hides the language chips once the caller fixed a language', () => {
    stubFetch({ entries: EMPTY, suggestions: [] })
    render(<LookupPanel direction="vi" label="VN" lang="en" />)
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })

  it('opens the first result on Enter', async () => {
    stubFetch({ entries: { ...EMPTY, en: [entry({ id: 'en:dog', glossVi: 'Con chó' })] }, suggestions: [] })
    render(<LookupPanel direction="fw" label="FW" />)
    const input = screen.getByLabelText('FW')
    await userEvent.type(input, 'dog')
    await screen.findByText('Con chó')
    await userEvent.type(input, '{Enter}')
    expect(push).toHaveBeenCalledWith(entryPath('en:dog'))
  })

  // A phrase is both a passage and a possible headword, so three routes answer it.
  function stubRoutes(search: unknown) {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      const u = String(url)
      const body = u.startsWith('/dictionary/search') ? search
        : u.includes('/dictionary/text/lookup') ? { lang: 'en', words: [] }
          : { enabled: true, from: 'en', translations: { vi: 'từ bỏ' } }
      return { ok: true, json: async () => body } as Response
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('searches a phrase as a headword as well as translating it', async () => {
    const fetchMock = stubRoutes({
      entries: {
        ...EMPTY,
        en: [
          entry({ id: 'en:give up', headword: 'give up', glossVi: 'Từ bỏ', matchScore: 4.0 }),
          entry({ id: 'en:give up hope', headword: 'give up hope', glossVi: 'Hết hy vọng', matchScore: 3.0 }),
        ],
      },
      suggestions: [],
    })
    render(<LookupPanel direction="fw" label="FW" />)
    await userEvent.type(screen.getByLabelText('FW'), 'give up')
    expect(await screen.findByRole('link', { name: /Từ bỏ/ })).toHaveAttribute('href', entryPath('en:give up'))
    expect(screen.getByRole('link', { name: /give up hope/ })).toBeInTheDocument()
    expect(await screen.findByText('từ bỏ', {}, { timeout: 2000 })).toBeInTheDocument()
    const searches = fetchMock.mock.calls.filter((c) => String(c[0]).startsWith('/dictionary/search'))
    expect(String(searches.at(-1)?.[0])).toContain('q=give+up')
    expect(screen.queryByText('Không tìm thấy từ nào.')).toBeNull()
  })

  it('shows a phrase only the entries that match it whole, not spelling guesses', async () => {
    stubRoutes({
      entries: {
        ...EMPTY,
        en: [
          entry({ id: 'en:give up', headword: 'give up', glossVi: 'Từ bỏ', matchScore: 3.5 }),
          entry({ id: 'en:gas up', headword: 'gas up', glossVi: 'Đổ xăng', matchScore: 1.16 }),
        ],
      },
      suggestions: [],
    })
    render(<LookupPanel direction="fw" label="FW" />)
    await userEvent.type(screen.getByLabelText('FW'), 'gave up')
    expect(await screen.findByRole('link', { name: /Từ bỏ/ })).toHaveAttribute('href', entryPath('en:give up'))
    expect(screen.queryByText('Đổ xăng')).toBeNull()
  })

  it('opens the phrase entry on Enter', async () => {
    stubRoutes({ entries: { ...EMPTY, en: [entry({ id: 'en:give up', headword: 'give up', glossVi: 'Từ bỏ', matchScore: 4.0 })] }, suggestions: [] })
    render(<LookupPanel direction="fw" label="FW" />)
    const input = screen.getByLabelText('FW')
    await userEvent.type(input, 'give up')
    await screen.findByRole('link', { name: /Từ bỏ/ })
    await userEvent.type(input, '{Enter}')
    expect(push).toHaveBeenCalledWith(entryPath('en:give up'))
  })

  it('searches a two-syllable Vietnamese word in the dictionary', async () => {
    const fetchMock = stubRoutes({
      entries: { ...EMPTY, en: [entry({ id: 'en:look forward to', headword: 'look forward to', glossVi: 'Mong đợi', matchScore: 3.85 })] },
      suggestions: [],
    })
    render(<LookupPanel direction="vi" label="VN" lang="en" />)
    await userEvent.type(screen.getByLabelText('VN'), 'mong đợi')
    expect(await screen.findByRole('link', { name: /Mong đợi/ })).toHaveAttribute('href', entryPath('en:look forward to'))
    const searches = fetchMock.mock.calls.filter((c) => String(c[0]).startsWith('/dictionary/search'))
    expect(String(searches.at(-1)?.[0])).toContain('dir=vi')
  })

  it('does nothing on Enter while there is no result yet', async () => {
    stubFetch({ entries: EMPTY, suggestions: [] })
    render(<LookupPanel direction="fw" label="FW" />)
    const input = screen.getByLabelText('FW')
    await userEvent.type(input, 'zzzz')
    await screen.findByText('Không tìm thấy từ nào.')
    await userEvent.type(input, '{Enter}')
    expect(push).not.toHaveBeenCalled()
  })
})
