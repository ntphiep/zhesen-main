import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LookupView } from '@/components/lookup/LookupView'
import { WORD_LAYOUT_BOOT_SCRIPT, wordLayout } from '@/lib/dictionary/wordLayout'
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

// /dictionary/en/lime printed "1. vôi" then two English definitions with nothing marking them.
const lime: DictEntryDetail = {
  ...dog, id: 'en:lime', headword: 'lime', glossVi: 'vôi', glossEn: 'calcium oxide', relations: [], senseLinks: [],
  senses: [
    { pos: 'noun', glossVi: 'vôi', glossEn: 'calcium oxide', senseOrder: 1, id: 'en:lime#1' },
    { pos: 'noun', glossVi: null, glossEn: 'Any gluey or adhesive substance', senseOrder: 2, id: 'en:lime#2' },
    { pos: 'noun', glossVi: null, glossEn: 'A limelight; any spotlight.', senseOrder: 3, id: 'en:lime#3' },
  ],
}

beforeEach(() => {
  localStorage.clear()
  wordLayout.reset()
  delete document.documentElement.dataset.wordLayout
  window.history.replaceState(null, '', '/dictionary/en/dog')
})

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

  it('switches to the classic page, with the synonym under its sense', async () => {
    render(<LookupView detail={dog} characters={[]} siblings={[]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cổ điển' }))
    expect(await screen.findByText('Đồng nghĩa')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'dog' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'hound' })).toHaveAttribute('href', '/dictionary/en/hound')
    expect(localStorage.getItem('zhesen:word-layout')).toBe('classic')
  })

  it.each([['Tổng quan'], ['Song ngữ'], ['Cổ điển']])('says in %s how many meanings are not yet translated', async (name) => {
    render(<LookupView detail={lime} characters={[]} siblings={[]} />)
    await userEvent.click(screen.getByRole('button', { name }))
    expect(await screen.findByText('2 nghĩa chưa dịch sang tiếng Việt.')).toBeInTheDocument()
  })

  it.each([['Tổng quan'], ['Cổ điển']])('marks an English meaning in %s as not yet translated', async (name) => {
    render(<LookupView detail={lime} characters={[]} siblings={[]} />)
    await userEvent.click(screen.getByRole('button', { name }))
    const english = await screen.findByText('A limelight; any spotlight.')
    expect(english).toHaveTextContent(/chưa dịch/)
    for (const vi of screen.getAllByText('vôi')) expect(vi).not.toHaveTextContent(/chưa dịch/)
  })

  it('falls back to the overview for a stored layout that no longer exists', () => {
    localStorage.setItem('zhesen:word-layout', 'columns')
    render(<LookupView detail={dog} characters={[]} siblings={[]} />)
    expect(screen.getByRole('button', { name: 'Tổng quan' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Nghĩa chính')).toBeInTheDocument()
  })

  it('marks the page before paint only for a layout that still exists', () => {
    const cases: [string, string | undefined][] = [['classic', 'classic'], ['columns', undefined], ['overview', undefined]]
    for (const [stored, marked] of cases) {
      delete document.documentElement.dataset.wordLayout
      localStorage.setItem('zhesen:word-layout', stored)
      new Function(WORD_LAYOUT_BOOT_SCRIPT)()
      expect(document.documentElement.dataset.wordLayout).toBe(marked)
    }
  })
})
