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
    render(<LookupPanel direction="vi" label="VN" placeholder="p" />)
    await userEvent.type(screen.getByLabelText('VN'), 'con cho')
    await screen.findByText('Chưa tìm thấy từ nào.')
    expect(String(fetchMock.mock.calls[0][0])).toContain('dir=vi')
  })

  it('the fw panel does not send dir=vi', async () => {
    const fetchMock = stubFetch({ entries: EMPTY, suggestions: [] })
    render(<LookupPanel direction="fw" label="FW" placeholder="p" />)
    await userEvent.type(screen.getByLabelText('FW'), 'dog')
    await screen.findByText('Chưa tìm thấy từ nào.')
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('dir=vi')
  })

  it('renders a result with its headword and Vietnamese gloss', async () => {
    stubFetch({ entries: { ...EMPTY, en: [entry({ glossVi: 'Con chó' })] }, suggestions: [] })
    render(<LookupPanel direction="fw" label="FW" placeholder="p" />)
    await userEvent.type(screen.getByLabelText('FW'), 'dog')
    expect(await screen.findByText('dog')).toBeInTheDocument()
    expect(screen.getByText('Con chó')).toBeInTheDocument()
  })

  it('renders an empty result with suggestions as links to the entry, not refill buttons', async () => {
    stubFetch({
      entries: EMPTY,
      suggestions: [{ id: 'en:cot', lang: 'en', headword: 'cot', glossVi: 'Cái nôi', kind: 'headword' }],
    })
    render(<LookupPanel direction="fw" label="FW" placeholder="p" />)
    await userEvent.type(screen.getByLabelText('FW'), 'cat')
    const link = await screen.findByRole('link', { name: /cot/ })
    expect(link).toHaveAttribute('href', entryPath('en:cot'))
    expect(screen.queryByRole('button', { name: /cot/ })).toBeNull()
  })

  it('renders the refusal the route sent, not a generic empty result', async () => {
    stubFetch({ error: 'Đang có quá nhiều lượt tra cứu. Vui lòng thử lại sau ít giây.' }, false)
    render(<LookupPanel direction="fw" label="FW" placeholder="p" />)
    await userEvent.type(screen.getByLabelText('FW'), 'dog')
    expect(await screen.findByText('Đang có quá nhiều lượt tra cứu. Vui lòng thử lại sau ít giây.')).toBeInTheDocument()
    expect(screen.queryByText('Chưa tìm thấy từ nào.')).toBeNull()
  })

  it('shows the target-language chips only on the vi panel with no lang prop', () => {
    stubFetch({ entries: EMPTY, suggestions: [] })
    const { unmount } = render(<LookupPanel direction="vi" label="VN" placeholder="p" />)
    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
    unmount()

    render(<LookupPanel direction="fw" label="FW" placeholder="p" />)
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })

  it('hides the target-language chips on the vi panel once a language is fixed', () => {
    stubFetch({ entries: EMPTY, suggestions: [] })
    render(<LookupPanel direction="vi" label="VN" placeholder="p" lang="en" />)
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })

  it('opens the first result on Enter', async () => {
    stubFetch({ entries: { ...EMPTY, en: [entry({ id: 'en:dog', glossVi: 'Con chó' })] }, suggestions: [] })
    render(<LookupPanel direction="fw" label="FW" placeholder="p" />)
    const input = screen.getByLabelText('FW')
    await userEvent.type(input, 'dog')
    await screen.findByText('Con chó')
    await userEvent.type(input, '{Enter}')
    expect(push).toHaveBeenCalledWith(entryPath('en:dog'))
  })

  it('does nothing on Enter while there is no result yet', async () => {
    stubFetch({ entries: EMPTY, suggestions: [] })
    render(<LookupPanel direction="fw" label="FW" placeholder="p" />)
    const input = screen.getByLabelText('FW')
    await userEvent.type(input, 'zzzz')
    await screen.findByText('Chưa tìm thấy từ nào.')
    await userEvent.type(input, '{Enter}')
    expect(push).not.toHaveBeenCalled()
  })
})
