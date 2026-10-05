import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DictEntryPreview } from '@/lib/dictionary/types'

const { session, readNotebookStates, addWords } = vi.hoisted(() => ({
  session: { current: null as null | { user: { id: string; email: string | null } } },
  readNotebookStates: vi.fn(),
  addWords: vi.fn(),
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: session.current } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }),
}))
vi.mock('@/lib/wordlist/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/wordlist/store')>()),
  addWords,
}))
vi.mock('@/lib/wordlist/stats', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/wordlist/stats')>()),
  readNotebookStates,
}))

import { PassageBlock } from '@/components/search/PassageBlock'
import { rememberPendingSave } from '@/lib/wordlist/pendingSave'

function entry(id: string, level: string | null, frequencyRank: number | null): DictEntryPreview {
  const headword = id.slice(3)
  return {
    id, lang: 'en', headword, traditional: null, level, frequencyRank,
    ipa: null, pos: null, glossVi: headword, glossEn: null, audioUrl: null,
  }
}

const THE = entry('en:the', 'A1', 1)
const DOG = entry('en:dog', 'A1', 826)
const CAT = entry('en:cat', 'B2', 2000)
const BIRD = entry('en:bird', 'A2', 900)
const BYKNOWN: Record<string, DictEntryPreview> = { the: THE, dog: DOG, cat: CAT, bird: BIRD }

/** The translate route and the word list for `text`, every word in BYKNOWN resolved. */
function stubRoutes(text: string) {
  const segments = [...text.matchAll(/\p{L}+|[^\p{L}]+/gu)].map((m) => ({ text: m[0], word: /\p{L}/u.test(m[0]) }))
  const lookup = {
    lang: 'en', phrases: [], segments,
    words: segments.filter((s) => s.word).map((s) => ({ text: s.text, entry: BYKNOWN[s.text.toLowerCase()] ?? null })),
  }
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (url) => {
    const body = String(url).includes('/dictionary/text/lookup') ? lookup : { enabled: true, from: 'en', translations: { vi: 'x' } }
    return { ok: true, json: async () => body } as Response
  }))
}

beforeEach(() => {
  session.current = { user: { id: 'u1', email: 'learner@example.com' } }
  readNotebookStates.mockReset().mockResolvedValue(new Map())
  addWords.mockReset().mockImplementation(async (_c: unknown, drafts: unknown[]) => drafts)
  sessionStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

describe('PassageBlock read and keep (signed in)', () => {
  // Colour is not the only cue: the underline style and the spoken name say it too.
  it('marks each word by the notebook in one read, and gives a new A1 to B2 word its level', async () => {
    readNotebookStates.mockResolvedValue(new Map([['en:cat', 'known'], ['en:bird', 'saved']]))
    stubRoutes('The dog saw the cat and a bird.')
    render(<PassageBlock text="The dog saw the cat and a bird." direction="fw" targets={['en']} />)

    expect(await screen.findByRole('button', { name: /^dog, trình độ A1$/ }, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^bird, Đang học$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^cat, Đã biết$/ })).toBeInTheDocument()
    // The commonest hundred words carry no level: "the" on every line was noise.
    expect(screen.getAllByRole('button', { name: /^the$/i })).toHaveLength(2)
    expect(readNotebookStates).toHaveBeenCalledTimes(1)
    expect(readNotebookStates.mock.calls[0][1]).toEqual(['en:the', 'en:dog', 'en:cat', 'en:bird'])
  })

  it('saves every new A1 to B2 word of the passage with its own sentence', async () => {
    stubRoutes('The dog sleeps. The cat runs.')
    render(<PassageBlock text="The dog sleeps. The cat runs." direction="fw" targets={['en']} />)

    await userEvent.click(await screen.findByRole('button', { name: /Lưu 2 từ mới/ }, { timeout: 3000 }))
    expect(addWords).toHaveBeenCalledTimes(1)
    const drafts = addWords.mock.calls[0][1] as { entryId: string; example: string | null }[]
    expect(drafts.map((d) => [d.entryId, d.example])).toEqual([
      ['en:dog', 'The dog sleeps.'],
      ['en:cat', 'The cat runs.'],
    ])
    expect(await screen.findByText('Đã lưu 2 từ vào sổ tay.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^dog, Đang học$/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Lưu \d+ từ mới/ })).not.toBeInTheDocument()
  })

  // A guest pressed save on a word in the passage, registered, and came back to `?q=`.
  it('finishes the save a guest started before registering', async () => {
    rememberPendingSave('en:cat')
    stubRoutes('The dog sleeps. The cat runs.')
    render(<PassageBlock text="The dog sleeps. The cat runs." direction="fw" targets={['en']} />)

    await vi.waitFor(() => expect(addWords).toHaveBeenCalledTimes(1), { timeout: 3000 })
    const drafts = addWords.mock.calls[0][1] as { entryId: string; example: string | null }[]
    expect(drafts.map((d) => [d.entryId, d.example])).toEqual([['en:cat', 'The cat runs.']])
    expect(await screen.findByRole('button', { name: /^cat, Đang học$/ })).toBeInTheDocument()
  })
})

describe('PassageBlock read and keep (guest)', () => {
  it('shows plain tappable words and reads no notebook', async () => {
    session.current = null
    stubRoutes('The dog sleeps.')
    render(<PassageBlock text="The dog sleeps." direction="fw" targets={['en']} />)

    expect(await screen.findByRole('button', { name: 'dog' }, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Lưu \d+ từ mới/ })).not.toBeInTheDocument()
    expect(readNotebookStates).not.toHaveBeenCalled()
  })
})
