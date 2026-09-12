import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchBox } from '@/components/search/SearchBox'

const preview = (id: string, lang: string, headword: string, glossVi: string, extra: Partial<Record<'level' | 'pos', string | null>> = {}) => ({
  id, lang, headword, traditional: null, level: extra.level ?? null, ipa: null, pos: extra.pos ?? null, glossVi, glossEn: null, audioUrl: null,
})
type Preview = ReturnType<typeof preview>
type ByLang = { en: Preview[]; zh: Preview[]; es: Preview[] }
const EMPTY_BY_LANG: ByLang = { en: [], zh: [], es: [] }
const response = (overrides: Partial<{ forward: ByLang; reverse: ByLang; suggestions: unknown[] }>) => ({
  forward: EMPTY_BY_LANG, reverse: EMPTY_BY_LANG, suggestions: [], ...overrides,
})

const prefetch = vi.fn()
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ prefetch, push }) }))

beforeEach(() => {
  prefetch.mockClear()
  push.mockClear()
  vi.stubGlobal('fetch', vi.fn(async () => ({
    json: async () => response({ forward: { en: [preview('en:dog', 'en', 'dog', 'con chó')], zh: [], es: [] } }),
  })))
})

describe('SearchBox', () => {
  it('queries the search route and links each result to its detail page', async () => {
    render(<SearchBox initialQuery="" />)
    await userEvent.type(screen.getByRole('textbox'), 'dog')
    const link = await screen.findByRole('link', { name: /dog/ })
    expect(link).toHaveAttribute('href', '/dictionary/en/dog')
    expect(screen.getByText('con chó')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalled()
  })

  it('prefetches a result route on hover', async () => {
    render(<SearchBox initialQuery="" />)
    await userEvent.type(screen.getByRole('textbox'), 'dog')
    const link = await screen.findByRole('link', { name: /dog/ })
    await userEvent.hover(link)
    expect(prefetch).toHaveBeenCalledWith('/dictionary/en/dog')
  })

  it('opens the highlighted result when Enter is pressed', async () => {
    render(<SearchBox initialQuery="" />)
    const box = screen.getByRole('textbox')
    await userEvent.type(screen.getByRole('textbox'), 'dog')
    await screen.findByRole('link', { name: /dog/ })
    box.focus()
    await userEvent.keyboard('{Enter}')
    expect(push).toHaveBeenCalledWith('/dictionary/en/dog')
  })

  it('labels reverse (Vietnamese -> other language) results separately from forward ones', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      json: async () => response({ reverse: { en: [preview('en:receive', 'en', 'receive', 'nhận được')], zh: [], es: [] } }),
    })))
    render(<SearchBox initialQuery="" />)
    await userEvent.type(screen.getByRole('textbox'), 'nhận được')
    const link = await screen.findByRole('link', { name: /receive/ })
    expect(link).toHaveAttribute('href', '/dictionary/en/receive')
    expect(screen.getByText('· dịch từ tiếng Việt')).toBeInTheDocument()
  })

  it('shows "did you mean" suggestions when nothing matches in either direction', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      json: async () => response({ suggestions: [{ id: 'en:receive', lang: 'en', headword: 'receive', glossVi: 'nhận được' }] }),
    })))
    render(<SearchBox initialQuery="" />)
    await userEvent.type(screen.getByRole('textbox'), 'recieve')
    expect(await screen.findByText(/Có phải bạn tìm/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /receive/ })).toBeInTheDocument()
  })

  it('filters results by level and auto-hides filters with no options', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      json: async () => response({
        forward: {
          en: [
            preview('en:cat', 'en', 'cat', 'con mèo', { level: 'A1' }),
            preview('en:catalyze', 'en', 'catalyze', 'xúc tác', { level: 'B2' }),
          ],
          zh: [], es: [],
        },
      }),
    })))
    render(<SearchBox initialQuery="" />)
    await userEvent.type(screen.getByRole('textbox'), 'cat')
    await screen.findByText('cat')
    const linkHrefs = () => screen.getAllByRole('link').map((l) => l.getAttribute('href'))
    expect(linkHrefs()).toEqual(['/dictionary/en/cat', '/dictionary/en/catalyze'])

    const a1 = screen.getByRole('button', { name: 'A1' })
    await userEvent.click(a1)
    expect(linkHrefs()).toEqual(['/dictionary/en/cat'])
  })
})
