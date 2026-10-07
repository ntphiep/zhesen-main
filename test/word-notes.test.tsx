import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LookupView } from '@/components/lookup/LookupView'
import { wordLayout } from '@/lib/dictionary/wordLayout'
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

// en:discretion as production holds it, with the notes of migration 0198.
const discretion: DictEntryDetail = {
  id: 'en:discretion', lang: 'en', headword: 'discretion', traditional: null, level: 'C1', ipa: null, pos: 'noun',
  glossVi: 'sự thận trọng', glossEn: 'The quality of being discreet.', audioUrl: null,
  senses: [
    { pos: 'noun', glossVi: 'sự thận trọng', glossEn: 'The quality of being discreet.', senseOrder: 1, id: 'en:discretion#1' },
    { pos: 'noun', glossVi: 'quyền tự quyết', glossEn: "The freedom to make one's own judgements.", senseOrder: 3, id: 'en:discretion#3' },
  ],
  pronunciations: [
    { accent: 'en-UK', ipa: '/dɪˈskɹɛʃən/', audioUrl: null },
    { accent: 'en-US', ipa: '/dɪˈskɹɛʃən/', audioUrl: null },
  ],
  examples: [], relations: [], attributes: {}, senseLinks: [],
  notes: {
    origins: [{
      pos: ['noun'],
      chain: [
        { rel: 'inh', lang: 'enm', name: 'Middle English', word: 'discrecioun' },
        { rel: 'der', lang: 'fro', name: 'Old French', word: 'discretion' },
        { rel: 'der', lang: 'la-lat', name: 'Late Latin', word: 'discrētiō' },
        { rel: 'der', lang: 'la', name: 'Latin', word: 'discerno' },
      ],
    }],
    syllables: ['dis', 'cre', 'tion'],
    homophones: [],
    senseGrammar: { 'en:discretion#1': ['uncountable'], 'en:discretion#3': ['uncountable', 'with to'] },
  },
}

beforeEach(() => {
  localStorage.clear()
  wordLayout.reset()
  delete document.documentElement.dataset.wordLayout
  window.history.replaceState(null, '', '/dictionary/en/discretion')
})

describe('word notes', () => {
  it('shows the stressed syllable, the tips and the origin in the overview', () => {
    render(<LookupView detail={discretion} characters={[]} siblings={[]} />)
    const sound = screen.getByRole('heading', { name: 'Cách đọc' }).closest('section') as HTMLElement
    expect(within(sound).getByText('cre').tagName).toBe('B')
    expect(within(sound).getByText('3 âm tiết, trọng âm rơi vào âm tiết thứ 2')).toBeInTheDocument()
    expect(within(sound).getByText('Đuôi -tion đọc là /ʃən/.')).toBeInTheDocument()

    const origin = screen.getByRole('heading', { name: 'Nguồn gốc' }).closest('section') as HTMLElement
    expect(within(origin).getByText('từ tiếng Anh trung đại')).toBeInTheDocument()
    expect(within(origin).getByText('discrecioun')).toBeInTheDocument()
    expect(within(origin).queryByText('discerno')).not.toBeInTheDocument()
  })

  it('folds the older ancestors behind a button', async () => {
    render(<LookupView detail={discretion} characters={[]} siblings={[]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Xem thêm 1 đời trước' }))
    expect(screen.getByText('discerno')).toBeInTheDocument()
    expect(screen.getByText('từ tiếng Latinh')).toBeInTheDocument()
  })

  it('labels the main meanings with their grammar', () => {
    render(<LookupView detail={discretion} characters={[]} siblings={[]} />)
    const meanings = screen.getByRole('heading', { name: 'Nghĩa chính' }).closest('section') as HTMLElement
    expect(within(meanings).getAllByText('không đếm được')).toHaveLength(2)
    expect(within(meanings).getByText('đi với to')).toBeInTheDocument()
  })

  it.each([['Song ngữ'], ['Cổ điển'], ['Trang đọc']])('carries the notes into %s', async (name) => {
    render(<LookupView detail={discretion} characters={[]} siblings={[]} />)
    await userEvent.click(screen.getByRole('button', { name }))
    expect(await screen.findByRole('heading', { name: 'Nguồn gốc' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cách đọc' })).toBeInTheDocument()
    expect(screen.getAllByText('không đếm được').length).toBeGreaterThan(0)
  })

  it('states a syllable count only when an accent agrees with the written syllables or every accent agrees', () => {
    const idea = (syllables: string[] | null): DictEntryDetail => ({
      ...discretion, id: 'en:idea', headword: 'idea',
      pronunciations: [{ accent: 'en-UK', ipa: '/aɪˈdɪə/', audioUrl: null }, { accent: 'en-US', ipa: '/aɪˈdiə/', audioUrl: null }],
      notes: { origins: [], syllables, homophones: ['ideal'], senseGrammar: {} },
    })
    const { unmount } = render(<LookupView detail={idea(null)} characters={[]} siblings={[]} />)
    expect(screen.queryByText(/âm tiết/)).not.toBeInTheDocument()
    unmount()
    render(<LookupView detail={idea(['i', 'de', 'a'])} characters={[]} siblings={[]} />)
    expect(screen.getByText('3 âm tiết, trọng âm rơi vào âm tiết thứ 2')).toBeInTheDocument()
  })

  it('draws nothing for an entry without notes', () => {
    render(<LookupView detail={{ ...discretion, notes: null, pronunciations: [] }} characters={[]} siblings={[]} />)
    expect(screen.queryByText('Nguồn gốc')).not.toBeInTheDocument()
    expect(screen.queryByText('Cách đọc')).not.toBeInTheDocument()
    expect(screen.queryByText('không đếm được')).not.toBeInTheDocument()
  })
})
