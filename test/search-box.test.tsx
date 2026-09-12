import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchBox } from '@/components/search/SearchBox'

const preview = (id: string, lang: string, headword: string, glossVi: string, extra: Partial<Record<'level' | 'pos', string | null>> = {}) => ({
  id, lang, headword, traditional: null, level: extra.level ?? null, ipa: null, pos: extra.pos ?? null, glossVi, glossEn: null, audioUrl: null,
  // Real results carry how well they matched; the route sends it and the box
  // uses it to decide which direction and which language leads.
  matchScore: 4 as number | undefined,
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
    ok: true,
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
      ok: true,
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
      ok: true,
      json: async () => response({ suggestions: [{ id: 'en:receive', lang: 'en', headword: 'receive', glossVi: 'nhận được' }] }),
    })))
    render(<SearchBox initialQuery="" />)
    await userEvent.type(screen.getByRole('textbox'), 'recieve')
    expect(await screen.findByText(/Có phải bạn tìm/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /receive/ })).toBeInTheDocument()
  })

  it('filters results by level and auto-hides filters with no options', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
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
  /**
   * The component used to cast whatever came back to the result type. A reply
   * that was not a result set -- the route's 429 body, a server error, an HTML
   * page from a proxy -- therefore had no `forward` field and the next render
   * threw reading `forward[lang]`, blanking the page.
   */
  it('shows nothing instead of crashing when the route refuses the request', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Bạn tra cứu quá nhanh. Vui lòng thử lại sau ít giây.' }),
    })))
    render(<SearchBox initialQuery="" />)
    await userEvent.type(screen.getByRole('textbox'), 'dog')
    await new Promise((r) => setTimeout(r, 300))
    // Still mounted and still usable: a render that threw would have torn the
    // tree down and taken the input with it.
    expect(screen.getByRole('textbox')).toHaveValue('dog')
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  it('says the service is busy rather than that the word does not exist', async () => {
    // "Không tìm thấy kết quả" is a claim about the dictionary. When the route
    // refuses the request the dictionary was never asked, and a user told their
    // word is missing will go and look for it somewhere else.
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 429, json: async () => ({ error: 'chậm lại' }),
    })))
    render(<SearchBox initialQuery="" />)
    await userEvent.type(screen.getByRole('textbox'), 'dog')
    await new Promise((r) => setTimeout(r, 300))
    expect(screen.queryByText('Không tìm thấy kết quả.')).toBeNull()
    expect(screen.getAllByText(/quá nhiều lượt tra cứu/).length).toBeGreaterThan(0)
  })

  it('clears the busy notice once a later search succeeds', async () => {
    const fetchMock = vi
      .fn<() => Promise<{ ok: boolean; status?: number; json: () => Promise<unknown> }>>()
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({ error: 'chậm lại' }) })
      .mockResolvedValue({
        ok: true,
        json: async () => response({ forward: { en: [preview('en:dog', 'en', 'dog', 'con chó')], zh: [], es: [] } }),
      })
    vi.stubGlobal('fetch', fetchMock)
    render(<SearchBox initialQuery="" />)
    const box = screen.getByRole('textbox')
    await userEvent.type(box, 'dog')
    await new Promise((r) => setTimeout(r, 300))
    await userEvent.clear(box)
    await userEvent.type(box, 'dogs')
    await screen.findByRole('link', { name: /dog/ })
    expect(screen.queryAllByText(/quá nhiều lượt tra cứu/)).toHaveLength(0)
  })

  it('does not cache a refused request, so the next keystroke asks again', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({ error: 'chậm lại' }) }))
    vi.stubGlobal('fetch', fetchMock)
    render(<SearchBox initialQuery="" />)
    const box = screen.getByRole('textbox')
    await userEvent.type(box, 'dog')
    await new Promise((r) => setTimeout(r, 300))
    await userEvent.clear(box)
    await userEvent.type(box, 'dog')
    await new Promise((r) => setTimeout(r, 300))
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1)
  })

  it('survives a reply whose shape does not match the result type', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ forward: 'không phải kết quả' }) })))
    render(<SearchBox initialQuery="" />)
    await userEvent.type(screen.getByRole('textbox'), 'dog')
    await new Promise((r) => setTimeout(r, 300))
    expect(screen.getByRole('textbox')).toHaveValue('dog')
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })
  it('leads with the direction that answered better', async () => {
    // "con mèo" produces forward hits that are all trigram guesses while the
    // reverse lookup finds the word itself; showing the guesses first because
    // they happen to be the forward direction buries the answer.
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => response({
        forward: { en: [{ ...preview('en:con', 'en', 'con', 'lừa đảo'), matchScore: 1.75 }], zh: [], es: [] },
        reverse: { en: [{ ...preview('en:cat', 'en', 'cat', 'con mèo'), matchScore: 5.0 }], zh: [], es: [] },
      }),
    })))
    render(<SearchBox initialQuery="" />)
    await userEvent.type(screen.getByRole('textbox'), 'con mèo')
    await screen.findByRole('link', { name: /cat/ })
    expect(screen.getAllByRole('link').map((l) => l.getAttribute('href')))
      .toEqual(['/dictionary/en/cat', '/dictionary/en/con'])
  })

  it('keeps the forward direction first when it answered better', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => response({
        forward: { en: [{ ...preview('en:dog', 'en', 'dog', 'con chó'), matchScore: 4.02 }], zh: [], es: [] },
        reverse: { en: [{ ...preview('en:hound', 'en', 'hound', 'chó săn'), matchScore: 3.0 }], zh: [], es: [] },
      }),
    })))
    render(<SearchBox initialQuery="" />)
    await userEvent.type(screen.getByRole('textbox'), 'dog')
    await screen.findByRole('link', { name: /dog/ })
    expect(screen.getAllByRole('link').map((l) => l.getAttribute('href')))
      .toEqual(['/dictionary/en/dog', '/dictionary/en/hound'])
  })
})
