import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WARRANTY_LAYER_ROW, WARRANTY_SENSES } from './helpers/learner'
import { GlanceLayout } from '@/components/lookup/GlanceLayout'
import { LookupView } from '@/components/lookup/LookupView'
import { MapLayout } from '@/components/lookup/MapLayout'
import { ReadLayout } from '@/components/lookup/ReadLayout'
import { wordLayout } from '@/lib/dictionary/wordLayout'
import { buildWordView } from '@/lib/dictionary/wordView'
import { parseLearnerLayer, type LearnerBacklink } from '@/lib/dictionary/learner'
import type { CrossLangSibling, DictEntryDetail, DictSense } from '@/lib/dictionary/types'

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

const sense = (n: number, glossVi: string, glossEn: string): DictSense =>
  ({ pos: 'verb', glossVi, glossEn, senseOrder: n, id: `en:take#${n}` })

const take: DictEntryDetail = {
  id: 'en:take', lang: 'en', headword: 'take', traditional: null, level: null, ipa: null, pos: 'verb',
  glossVi: null, glossEn: null, audioUrl: null, senses: [sense(1, 'cầm, nắm', 'To grip.'), sense(2, 'mang đi', 'To carry.')],
  pronunciations: [], examples: [], relations: [], attributes: {}, senseLinks: [],
}
const sibling = (id: string, headword: string, glossVi: string | null): CrossLangSibling =>
  ({ id, lang: id.startsWith('zh') ? 'zh' : 'es', headword, reading: null, gender: null, pos: null, glossVi, glossEn: 'to take' })
const backlink = (n: number): LearnerBacklink =>
  ({ entryId: `es:w${n}`, headword: `w${n}`, lang: 'es', kinds: ['equivalent'], note: null })

beforeEach(() => {
  localStorage.clear()
  wordLayout.reset()
  delete document.documentElement.dataset.wordLayout
})

describe('the other languages', () => {
  // take listed rows marked CHƯA DỊCH, and 打 listed HIT.
  it('leaves out an equivalent with no Vietnamese and an acronym', () => {
    const v = buildWordView({
      detail: take, characters: [],
      siblings: [sibling('es:tomar', 'tomar', 'cầm, lấy'), sibling('es:sacar', 'sacar', null), sibling('es:HIT', 'HIT', 'đánh')],
    })
    expect(v.siblings.map((s) => s.headword)).toEqual(['tomar'])
  })

  // take's backlinks listed again the Spanish equivalents the panel above already shows.
  it('leaves a word the panel shows out of the backlinks, and shows six before expanding', async () => {
    const backlinks = [{ ...backlink(0), entryId: 'es:tomar', headword: 'tomar' }, ...[1, 2, 3, 4, 5, 6, 7, 8].map(backlink)]
    render(<LookupView detail={take} characters={[]} siblings={[sibling('es:tomar', 'tomar', 'cầm, lấy')]} backlinks={backlinks} />)
    const card = document.getElementById('backlinks')!
    expect(within(card).queryByText('tomar')).not.toBeInTheDocument()
    expect(within(card).getAllByRole('listitem')).toHaveLength(6)
    await userEvent.click(within(card).getByRole('button', { name: 'Xem thêm 2 từ' }))
    expect(within(card).getAllByRole('listitem')).toHaveLength(8)
  })
})

describe('the overview hero', () => {
  // "100 nghĩa · 74 cụm từ · 32 từ cùng họ" and a summary the main card repeats.
  it('carries no counters and no summary the main card repeats', () => {
    render(<LookupView detail={take} characters={[]} siblings={[]} />)
    const hero = document.querySelector('[data-word-layout-panel="overview"] header') ?? document.querySelector('header')!
    expect(hero).not.toHaveTextContent(/\d+ nghĩa/)
    expect(hero).not.toHaveTextContent('cầm')
  })
})

describe('the first meaning comes before the forms', () => {
  const withForms = { detail: take, characters: [], siblings: [], inflections: [{ formText: 'took', formLabel: 'past' }, { formText: 'takes', formLabel: 'third-person singular' }] }

  it.each([['Song ngữ'], ['Cổ điển']])('in %s', async (name) => {
    render(<LookupView {...withForms} />)
    await userEvent.click(screen.getByRole('button', { name }))
    const panel = screen.getByRole('button', { name }).closest('main') ?? document.body
    const meaning = within(panel).getAllByText('cầm, nắm').find((el) => el.closest('[hidden]') === null)!
    const forms = within(panel).getAllByRole('heading', { name: /^Dạng từ/ }).find((el) => el.closest('[hidden]') === null)!
    expect(meaning.compareDocumentPosition(forms) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('the learner layouts', () => {
  const warranty: DictEntryDetail = {
    id: 'en:warranty', lang: 'en', headword: 'warranty', traditional: null, level: null, ipa: null, pos: 'noun',
    glossVi: 'sự bảo đảm', glossEn: 'A guarantee', audioUrl: null,
    senses: WARRANTY_SENSES, pronunciations: [], examples: [], relations: [], attributes: {}, senseLinks: [],
  }
  const layer = parseLearnerLayer(WARRANTY_LAYER_ROW)
  const view = buildWordView({ detail: warranty, characters: [], siblings: [], learner: layer })
  const labels = Array.from({ length: 9 }, (_, i) => ({
    senseId: `en:x#${i}`, coreSenseOrder: null, viTerms: [`nghĩa ${i}`], domain: null, register: null,
    isInflection: false, lemma: null, lemmaEntryId: null,
  }))
  const gistLine = (gist: string) => (_: string, el: Element | null) => el?.tagName === 'P' && el.textContent === gist
  const LAYOUTS = [['MapLayout', MapLayout], ['ReadLayout', ReadLayout], ['GlanceLayout', GlanceLayout]] as const

  // "bảo hành – sự bảo đảm" over senses titled "bảo hành, giấy bảo hành" and "sự bảo đảm, sự cam đoan",
  // then "3 nghĩa chính · 5 nghĩa khác · 9 kết hợp".
  it.each(LAYOUTS)('%s drops the counters and a gist its senses already list', (_, Layout) => {
    const { unmount } = render(<Layout view={view} layer={layer} />)
    expect(document.querySelector('header')).not.toHaveTextContent(/nghĩa chính/)
    expect(screen.queryByText(gistLine('bảo hành – sự bảo đảm'))).not.toBeInTheDocument()
    unmount()
    render(<Layout view={view} layer={{ ...layer, gistVi: ['bảo hành', 'giấy tờ'] }} />)
    expect(screen.getByText(gistLine('bảo hành – giấy tờ'))).toBeInTheDocument()
  })

  it('folds a long usage note, and opens it', async () => {
    render(<MapLayout view={view} layer={layer} />)
    const note = screen.getByText(/^Warranty thường gặp nhất/)
    expect(note.className).toContain('line-clamp-4')
    await userEvent.click(screen.getByRole('button', { name: 'Đọc tiếp' }))
    expect(note.className).not.toContain('line-clamp-4')
  })

  it('folds the other senses on the reading page after six', async () => {
    render(<ReadLayout view={view} layer={{ ...layer, labels }} />)
    const minor = document.getElementById('minor-senses')!
    expect(within(minor).getAllByRole('listitem')).toHaveLength(6)
    await userEvent.click(within(minor).getByRole('button', { name: 'Xem thêm 3 nghĩa khác' }))
    expect(within(minor).getAllByRole('listitem')).toHaveLength(9)
  })

  it('folds the other senses and the collocations at a glance after six', async () => {
    render(<GlanceLayout view={view} layer={{ ...layer, labels }} />)
    expect(screen.queryByText('nghĩa 6')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Xem thêm 3 nghĩa khác' }))
    expect(screen.getByText('nghĩa 8')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'breach of warranty' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Xem thêm 3 kết hợp' }))
    expect(screen.getByRole('link', { name: 'breach of warranty' })).toBeInTheDocument()
  })
})
