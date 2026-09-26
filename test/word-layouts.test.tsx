import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LookupView } from '@/components/lookup/LookupView'
import { wordLayout } from '@/lib/dictionary/wordLayout'
import { buildWordView } from '@/lib/dictionary/wordView'
import type { DictEntryDetail } from '@/lib/dictionary/types'

vi.mock('@/lib/supabase/client', async () => {
  const { accountAuthStub } = await import('./helpers/supabase')
  return { createClient: () => accountAuthStub({ id: 'u1', email: 'a@b.com' }) }
})
vi.mock('@/lib/wordlist/store', () => ({
  addWord: vi.fn(async () => ({})),
  draftFromDictEntry: (e: { headword: string }) => ({ headword: e.headword }),
  isWordSaved: vi.fn(async () => false),
}))
vi.mock('@/lib/ai/browser', () => ({ callAi: vi.fn(), aiEnabled: vi.fn(async () => false) }))

const dog: DictEntryDetail = {
  id: 'en:dog', lang: 'en', headword: 'dog', traditional: null, level: 'A1', ipa: null, pos: 'noun',
  glossVi: 'con chó', glossEn: 'dog', audioUrl: null,
  senses: [{ pos: 'noun', glossVi: 'con chó', glossEn: 'a domesticated canid', senseOrder: 1, id: 'en:dog#1' }],
  pronunciations: [], examples: [],
  relations: [{ relationType: 'synonym', relatedText: 'hound', relatedEntryId: null }],
  attributes: {},
  senseLinks: [{ text: 'hound', senseOrder: 1, targetId: 'en:hound' }],
}
const hound: DictEntryDetail = {
  ...dog, id: 'en:hound', headword: 'hound', glossVi: 'chó săn', relations: [], senseLinks: [],
  senses: [{ pos: 'noun', glossVi: 'chó săn', glossEn: 'a hunting dog', senseOrder: 1, id: 'en:hound#1' }],
}

beforeEach(() => {
  localStorage.clear()
  wordLayout.reset()
  delete document.documentElement.dataset.wordLayout
  window.history.replaceState(null, '', '/dictionary/en/dog')
})
afterEach(() => vi.unstubAllGlobals())

describe('word page layouts', () => {
  it('opens in the overview, with the synonym under its sense', () => {
    render(<LookupView detail={dog} characters={[]} siblings={[]} />)
    expect(screen.getByRole('button', { name: 'Tổng quan' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Nghĩa chính')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'hound' })).toHaveAttribute('href', '/dictionary/en/hound')
  })

  it('switches to the side-by-side rows and remembers the choice', async () => {
    render(<LookupView detail={dog} characters={[]} siblings={[]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Song ngữ' }))
    expect(await screen.findByText('Tiếng Việt')).toBeInTheDocument()
    expect(screen.getByText('a domesticated canid')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'dog' })).toBeInTheDocument()
    expect(localStorage.getItem('zhesen:word-layout')).toBe('bilingual')
    expect(document.documentElement.dataset.wordLayout).toBe('bilingual')
  })

  it('opens a related word as a column beside the page and keeps it in the address', async () => {
    const fetchMock = vi.fn(async () => Response.json(buildWordView({ detail: hound, characters: [], siblings: [] })))
    vi.stubGlobal('fetch', fetchMock)
    render(<LookupView detail={dog} characters={[]} siblings={[]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Nhiều cột' }))
    await userEvent.click(await screen.findByRole('link', { name: 'hound' }))

    const pane = (await screen.findByRole('heading', { level: 2, name: 'hound' })).closest('article')
    if (!pane) throw new Error('the opened word has no column')
    expect(within(pane).getByText('chó săn', { selector: 'span' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/dictionary/view?id=en%3Ahound', expect.anything())
    expect(window.location.hash).toBe('#open=en%3Ahound')

    await userEvent.click(screen.getByRole('button', { name: 'Đóng cột' }))
    expect(screen.queryByRole('heading', { level: 2, name: 'hound' })).toBeNull()
    expect(window.location.hash).toBe('')
  })

  it('reopens a chain from the address once per word, without the page word', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(buildWordView({ detail: hound, characters: [], siblings: [] }))))
    localStorage.setItem('zhesen:word-layout', 'columns')
    window.history.replaceState(null, '', '/dictionary/en/dog#open=en%3Ahound,en%3Ahound,en%3Adog')
    render(<LookupView detail={dog} characters={[]} siblings={[]} />)
    expect(await screen.findAllByRole('heading', { level: 2, name: 'hound' })).toHaveLength(1)
    expect(screen.getAllByRole('heading', { level: 1, name: 'dog' })).toHaveLength(1)
  })
})
