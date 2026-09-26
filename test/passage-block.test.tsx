import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PassageBlock, looksLikeAPassage } from '@/components/search/PassageBlock'
import type { DictEntryPreview } from '@/lib/dictionary/types'

// The translated output renders through TappableText, which resolves its words against
// Supabase from the browser. Neither the client nor the resolution is what these cases are
// about, so both are stubbed: `desk` resolves, everything else stays plain text.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }),
}))
vi.mock('@/lib/dictionary/resolveTokens', () => ({
  getZhSegmentCandidates: async () => [],
  resolveTokens: async () => new Map([['desk', {
    id: 'en:desk', lang: 'en', headword: 'desk', traditional: null, level: null,
    ipa: null, pos: null, glossVi: 'Cái bàn', glossEn: null, audioUrl: null,
  }]]),
}))

describe('looksLikeAPassage', () => {
  it('is two words or more for the foreign direction, Latin script', () => {
    expect(looksLikeAPassage('one', 'fw')).toBe(false)
    expect(looksLikeAPassage('one two', 'fw')).toBe(true)
  })

  // Han carries no spaces, so word count does not apply to it: four characters is the
  // line, not two "words".
  it('is four characters or more for the foreign direction, Han script', () => {
    expect(looksLikeAPassage('我爱你', 'fw')).toBe(false)
    expect(looksLikeAPassage('我爱你们', 'fw')).toBe(true)
  })

  it('is two words or more for the Vietnamese direction, Han rule not applied', () => {
    expect(looksLikeAPassage('cá', 'vi')).toBe(false)
    expect(looksLikeAPassage('con cá', 'vi')).toBe(true)
    // Four Han characters would pass the fw rule; the vi direction only counts words.
    expect(looksLikeAPassage('我爱你们', 'vi')).toBe(false)
  })
})

// The vi direction never fires the word-lookup effect (`direction !== 'fw'` skips it),
// so a translate-only fetch mock is enough to isolate the translation block's states.
// A failing expectation thrown here would land inside PassageBlock's own try/catch and
// surface as its generic error state instead of failing the test, so the URL is
// asserted from `fetchMock.mock.calls` after the fact, never inside the mock body.
function stubTranslate(body: unknown, ok = true) {
  const fetchMock = vi.fn<typeof fetch>(async () => ({ ok, json: async () => body }) as Response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

describe('PassageBlock translation states', () => {
  // `targets={['en']}` is one language, so `POST /dictionary/translate` answers with
  // `translations` holding only `en` (app/dictionary/translate/route.ts builds the object
  // from `to` alone). `lib/translate/client.ts` spells the four keys out with `.optional()`
  // rather than `z.record(z.enum(...), ...)`, which in Zod 4 required every key present and
  // failed to parse exactly this one-language answer.
  it('shows the translation once the route answers ok', async () => {
    const fetchMock = stubTranslate({ enabled: true, from: 'vi', translations: { en: 'I want a new desk' } })
    const { container } = render(<PassageBlock text="tôi muốn mua một cái bàn" direction="vi" targets={['en']} />)
    expect(await screen.findByText('Tiếng Anh', {}, { timeout: 2000 })).toBeInTheDocument()
    expect(container.textContent).toContain('I want a new desk')
    expect(fetchMock).toHaveBeenCalledWith('/dictionary/translate', expect.objectContaining({ method: 'POST' }))
  })

  it('sends no source language, so Azure detects it', async () => {
    const fetchMock = stubTranslate({ enabled: true, from: 'vi', translations: { en: 'x' } })
    render(<PassageBlock text="tôi muốn mua một cái bàn" direction="vi" targets={['en']} />)
    await screen.findByText('Tiếng Anh', {}, { timeout: 2000 })
    const init = fetchMock.mock.calls[0][1]
    const sent: unknown = JSON.parse(String(init?.body))
    expect(sent).not.toHaveProperty('from')
  })

  it('makes a word of the translation tappable, with a link into its entry', async () => {
    stubTranslate({ enabled: true, from: 'vi', translations: { en: 'I want a new desk' } })
    render(<PassageBlock text="tôi muốn mua một cái bàn" direction="vi" targets={['en']} />)
    const word = await screen.findByRole('button', { name: 'desk' }, { timeout: 2000 })
    await userEvent.click(word)
    expect(screen.getByText('Cái bàn')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Xem chi tiết/ })).toHaveAttribute('href', '/dictionary/en/desk')
  })

  it('marks the output as untouched when Azure detected the target language itself', async () => {
    stubTranslate({ enabled: true, from: 'en', translations: { en: 'Hello world' } })
    render(<PassageBlock text="Hello world" direction="vi" targets={['en']} />)
    expect(await screen.findByText('nguyên văn', {}, { timeout: 2000 })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'desk' })).toBeNull()
  })

  it('says translation is off for this deployment when the route answers disabled', async () => {
    stubTranslate({ enabled: false })
    render(<PassageBlock text="con chó này rất đẹp" direction="vi" targets={['en']} />)
    expect(await screen.findByText('Chưa hỗ trợ dịch cả đoạn.', {}, { timeout: 2000 })).toBeInTheDocument()
  })

  it('shows the route refusal message on a non-ok response', async () => {
    stubTranslate({ error: 'Đang có quá nhiều lượt dịch. Vui lòng thử lại sau ít giây.' }, false)
    render(<PassageBlock text="con chó này rất đẹp" direction="vi" targets={['en']} />)
    expect(await screen.findByText('Đang có quá nhiều lượt dịch. Vui lòng thử lại sau ít giây.', {}, { timeout: 2000 })).toBeInTheDocument()
  })
})

// The word list is `fw`-only (`direction !== 'fw'` skips the effect that fetches it): the
// dictionary indexes no Vietnamese headwords, so the `vi` direction has nothing to link
// each word to. Both `POST /dictionary/translate` and `POST /dictionary/text/lookup` fire
// for `fw`, so the mock dispatches on the URL rather than answering every call alike.
function stubRoutes(translateBody: unknown, textLookupBody: unknown) {
  const fetchMock = vi.fn<typeof fetch>(async (url) => {
    const body = String(url).includes('/dictionary/text/lookup') ? textLookupBody : translateBody
    return { ok: true, json: async () => body } as Response
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function wordEntry(overrides: Partial<DictEntryPreview> = {}): DictEntryPreview {
  return {
    id: 'en:dog', lang: 'en', headword: 'dog', traditional: null, level: null,
    ipa: null, pos: null, glossVi: null, glossEn: null, audioUrl: null,
    ...overrides,
  }
}

describe('PassageBlock word list (fw direction)', () => {
  it('links a word that resolved to a dictionary entry, and says so for one that did not', async () => {
    stubRoutes(
      { enabled: true, from: 'en', translations: { vi: 'Con chó sủa.' } },
      {
        lang: 'en',
        words: [
          { text: 'The', entry: null },
          { text: 'dog', entry: wordEntry({ glossVi: 'Con chó' }) },
        ],
      },
    )
    render(<PassageBlock text="The dog barks" direction="fw" targets={['en']} />)

    const link = await screen.findByRole('link', { name: /dog/ }, { timeout: 2000 })
    expect(link).toHaveAttribute('href', '/dictionary/en/dog')
    expect(screen.getByText('Con chó')).toBeInTheDocument()
    expect(screen.getByText('The')).toBeInTheDocument()
    expect(screen.getByText('Không có trong từ điển')).toBeInTheDocument()
  })

  it('renders no word list when the route finds nothing to resolve', async () => {
    stubRoutes({ enabled: true, from: 'en', translations: { vi: 'x' } }, { lang: 'en', words: [] })
    render(<PassageBlock text="The dog barks" direction="fw" targets={['en']} />)
    await screen.findByText('x', {}, { timeout: 2000 })
    expect(screen.queryByText('Tra từng từ trong đoạn')).toBeNull()
  })
})

describe('PassageBlock dictionary hits for a short translation (vi direction)', () => {
  function stubTranslateAndSearch(translateBody: unknown, searchBody: unknown) {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      const body = String(url).startsWith('/dictionary/search') ? searchBody : translateBody
      return { ok: true, json: async () => body } as Response
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('lists the structural hits for the translation, marked as coming from it', async () => {
    const fetchMock = stubTranslateAndSearch(
      { enabled: true, from: 'vi', translations: { en: 'Attendees' } },
      {
        entries: {
          en: [
            wordEntry({ id: 'en:attendee', headword: 'attendee', matchScore: 3.5 }),
            wordEntry({ id: 'en:attention', headword: 'attention', matchScore: 1.8 }),
          ],
          es: [], zh: [],
        },
        suggestions: [],
      },
    )
    render(<PassageBlock text="người tham dự" direction="vi" targets={['en']} />)

    const link = await screen.findByRole('link', { name: /attendee/ }, { timeout: 2000 })
    expect(link).toHaveAttribute('href', '/dictionary/en/attendee')
    expect(screen.getByText('Dịch máy: Attendees')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /attention/ })).toBeNull()
    const search = fetchMock.mock.calls.find((c) => String(c[0]).startsWith('/dictionary/search'))
    expect(String(search?.[0])).toContain('q=Attendees')
    expect(String(search?.[0])).toContain('langs=en')
    expect(fetchMock.mock.calls.filter((c) => String(c[0]) === '/dictionary/translate')).toHaveLength(1)
  })

  it('searches nothing for a translation that is a sentence', async () => {
    const fetchMock = stubTranslateAndSearch(
      { enabled: true, from: 'vi', translations: { en: 'I want a new desk' } },
      { entries: { en: [], es: [], zh: [] }, suggestions: [] },
    )
    render(<PassageBlock text="tôi muốn mua một cái bàn" direction="vi" targets={['en']} />)
    await screen.findByText('Tiếng Anh', {}, { timeout: 2000 })
    expect(fetchMock.mock.calls.some((c) => String(c[0]).startsWith('/dictionary/search'))).toBe(false)
  })
})
