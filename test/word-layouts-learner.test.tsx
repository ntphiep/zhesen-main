import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { GUARANTEE_BACKLINK_ROWS, WARRANTY_LAYER_ROW, WARRANTY_SENSES } from './helpers/learner'
import { LookupView } from '@/components/lookup/LookupView'
import { MapLayout } from '@/components/lookup/MapLayout'
import { ReadLayout } from '@/components/lookup/ReadLayout'
import { GlanceLayout } from '@/components/lookup/GlanceLayout'
import { parseBacklinks, parseLearnerLayer } from '@/lib/dictionary/learner'
import {
  WORD_LAYOUT_BOOT_SCRIPT, availableLayouts, resolveLayout, wordLayout, type WordLayout,
} from '@/lib/dictionary/wordLayout'
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

const warranty: DictEntryDetail = {
  id: 'en:warranty', lang: 'en', headword: 'warranty', traditional: null, level: null, ipa: null, pos: 'noun',
  glossVi: 'sự bảo đảm', glossEn: 'A guarantee', audioUrl: null,
  senses: WARRANTY_SENSES, pronunciations: [], examples: [], relations: [], attributes: {}, senseLinks: [],
}
const layer = parseLearnerLayer(WARRANTY_LAYER_ROW)
const backlinks = parseBacklinks(GUARANTEE_BACKLINK_ROWS)
const view = buildWordView({ detail: warranty, characters: [], siblings: [], learner: layer, backlinks })

beforeEach(() => {
  localStorage.clear()
  wordLayout.reset()
  delete document.documentElement.dataset.wordLayout
})

describe('which layouts an entry offers', () => {
  it('offers the three learner layouts only with a layer', () => {
    const keys = (learner: boolean) => availableLayouts({ learner }).map((l) => l.key)
    expect(keys(false)).toEqual(['overview', 'bilingual', 'classic'])
    expect(keys(true)).toEqual(['overview', 'bilingual', 'classic', 'map', 'read', 'glance'])
  })

  it('draws the classic page for a learner layout on an entry without a layer', () => {
    const cases: [WordLayout, boolean, WordLayout][] = [
      ['map', false, 'classic'], ['glance', false, 'classic'], ['map', true, 'map'], ['bilingual', false, 'bilingual'],
    ]
    for (const [stored, learner, drawn] of cases) expect(resolveLayout(stored, { learner })).toBe(drawn)
  })

  it('marks the page before paint for a stored learner layout', () => {
    localStorage.setItem('zhesen:word-layout', 'map')
    new Function(WORD_LAYOUT_BOOT_SCRIPT)()
    expect(document.documentElement.dataset.wordLayout).toBe('map')
  })

  it('renders classic, and keeps the stored choice, when the entry has no layer', async () => {
    localStorage.setItem('zhesen:word-layout', 'read')
    render(<LookupView detail={{ ...warranty, id: 'en:plain' }} characters={[]} siblings={[]} />)
    expect(screen.getByRole('button', { name: 'Cổ điển' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'Trang đọc' })).not.toBeInTheDocument()
    expect(document.querySelector('[data-rendered-layout]')).toHaveAttribute('data-rendered-layout', 'classic')
    expect(localStorage.getItem('zhesen:word-layout')).toBe('read')
  })

  it('says why classic shows instead of the stored layout, and lists what the entry offers', () => {
    localStorage.setItem('zhesen:word-layout', 'map')
    render(<LookupView detail={{ ...warranty, id: 'en:plain' }} characters={[]} siblings={[]} />)
    expect(screen.getByText('Từ này chưa có bố cục Bản đồ nghĩa, đang hiện Cổ điển.')).toBeInTheDocument()
    expect(document.querySelector('main')).toHaveAttribute('data-layouts', 'overview bilingual classic')
  })

  it('marks the stored overview as the default and names every layout in the phone picker', () => {
    render(<LookupView detail={warranty} characters={[]} siblings={[]} learner={layer} backlinks={backlinks} />)
    expect(within(screen.getByRole('button', { name: 'Tổng quan' })).getByText('mặc định')).toBeInTheDocument()
    expect(screen.queryByText(/chưa có bố cục/)).not.toBeInTheDocument()
    const select = screen.getByRole('combobox', { name: 'Bố cục' })
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Tổng quan (mặc định)', 'Song ngữ', 'Cổ điển', 'Bản đồ nghĩa', 'Trang đọc', 'Toàn cảnh',
    ])
    expect(document.querySelector('main')).toHaveAttribute('data-layouts', 'overview bilingual classic map read glance')
  })

  it('switches to a learner layout, remembers it and marks it as the default', async () => {
    render(<LookupView detail={warranty} characters={[]} siblings={[]} learner={layer} backlinks={backlinks} />)
    const picker = screen.getByRole('group', { name: 'Bố cục' })
    expect(within(screen.getByRole('button', { name: 'Tổng quan' })).getByText('mặc định')).toBeInTheDocument()
    await userEvent.click(within(picker).getByRole('button', { name: 'Bản đồ nghĩa' }))
    expect(await screen.findByRole('navigation', { name: 'Các nghĩa' })).toBeInTheDocument()
    expect(localStorage.getItem('zhesen:word-layout')).toBe('map')
    expect(within(screen.getByRole('button', { name: 'Bản đồ nghĩa' })).getByText('mặc định')).toBeInTheDocument()
  })
})

describe('the server pass', () => {
  it('draws every layout the entry offers, one panel each, with ids unique in the page', () => {
    const html = renderToString(<LookupView detail={warranty} characters={[]} siblings={[]} learner={layer} backlinks={backlinks} />)
    const box = document.createElement('div')
    box.innerHTML = html
    const main = box.querySelector('main')
    expect(main).toHaveAttribute('data-boot')
    expect([...box.querySelectorAll('[data-panel]')].map((p) => p.getAttribute('data-panel'))).toEqual([
      'overview', 'bilingual', 'classic', 'map', 'read', 'glance',
    ])
    const ids = [...box.querySelectorAll('[id]')].map((e) => e.id)
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
    expect(box.querySelector('[data-panel="read"] nav a')).toHaveAttribute('href', '#read-sense-1')
    expect(box.querySelectorAll('[data-note]')).toHaveLength(0)
  })

  it('writes a note for each learner layout an entry without a layer lacks', () => {
    const box = document.createElement('div')
    box.innerHTML = renderToString(<LookupView detail={{ ...warranty, id: 'en:plain' }} characters={[]} siblings={[]} />)
    expect([...box.querySelectorAll('[data-panel]')].map((p) => p.getAttribute('data-panel'))).toEqual(['overview', 'bilingual', 'classic'])
    expect([...box.querySelectorAll('[data-note]')].map((n) => n.textContent)).toEqual([
      'Từ này chưa có bố cục Bản đồ nghĩa, đang hiện Cổ điển.',
      'Từ này chưa có bố cục Trang đọc, đang hiện Cổ điển.',
      'Từ này chưa có bố cục Toàn cảnh, đang hiện Cổ điển.',
    ])
  })

  it('keeps one panel once the client renders', () => {
    localStorage.setItem('zhesen:word-layout', 'read')
    render(<LookupView detail={warranty} characters={[]} siblings={[]} learner={layer} backlinks={backlinks} />)
    expect([...document.querySelectorAll('[data-panel]')].map((p) => p.getAttribute('data-panel'))).toEqual(['read'])
    expect(document.querySelector('main')).not.toHaveAttribute('data-boot')
    expect(document.getElementById('sense-1')).not.toBeNull()
  })
})

describe('the layers that mention a word', () => {
  const guarantee: DictEntryDetail = {
    ...warranty, id: 'en:guarantee', headword: 'guarantee', glossVi: 'sự bảo đảm',
    senses: [{ id: 'en:guarantee#1', pos: 'noun', glossVi: 'sự bảo đảm', glossEn: 'A promise', senseOrder: 1 }],
  }

  it('shows warranty on en:guarantee in the overview, the classic and the bilingual page', async () => {
    render(<LookupView detail={guarantee} characters={[]} siblings={[]} backlinks={backlinks} />)
    const shown = async () => {
      expect(await screen.findByRole('heading', { name: 'Xuất hiện ở từ khác' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'warranty' })).toHaveAttribute('href', '/dictionary/en/warranty')
      expect(screen.getByText('dễ nhầm, đồng nghĩa')).toBeInTheDocument()
    }
    await shown()
    await userEvent.click(screen.getByRole('button', { name: 'Cổ điển' }))
    await shown()
    await userEvent.click(screen.getByRole('button', { name: 'Song ngữ' }))
    await shown()
  })

  it('draws no block on a word nobody mentions', () => {
    render(<LookupView detail={guarantee} characters={[]} siblings={[]} />)
    expect(screen.queryByText('Xuất hiện ở từ khác')).not.toBeInTheDocument()
  })
})

describe('MapLayout', () => {
  it('lists every sense and shows the chosen one in full', async () => {
    render(<MapLayout view={view} layer={layer} />)
    const list = screen.getByRole('navigation', { name: 'Các nghĩa' })
    expect(within(list).getAllByRole('button')).toHaveLength(3 + 5)
    expect(within(list).getByText('Nghĩa khác')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'bảo hành, giấy bảo hành' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'under warranty' })).toHaveAttribute('href', '/dictionary/en/under%20warranty')
    expect(screen.getByText('质保').tagName).toBe('SPAN')
    expect(screen.getByText('Từ nghĩa #5 của Wiktionary')).toBeInTheDocument()

    await userEvent.click(within(list).getByRole('button', { name: /sự bảo đảm, sự cam đoan/ }))
    expect(screen.getByRole('heading', { level: 2, name: 'sự bảo đảm, sự cam đoan' })).toBeInTheDocument()
  })

  it('moves between senses with the arrow keys, into the minor senses', () => {
    render(<MapLayout view={view} layer={layer} />)
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    expect(screen.getByRole('heading', { level: 2, name: 'bảo đảm, điều khoản bảo đảm' })).toBeInTheDocument()
    expect(screen.getByText('câu soạn mới')).toBeInTheDocument()
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    expect(screen.getByRole('heading', { level: 2, name: 'giao ước bảo đảm quyền sở hữu đất' })).toBeInTheDocument()
    expect(screen.getByText('Từ nghĩa #2 của Wiktionary')).toBeInTheDocument()
    fireEvent.keyDown(document.body, { key: 'ArrowUp' })
    expect(screen.getByRole('heading', { level: 2, name: 'bảo đảm, điều khoản bảo đảm' })).toBeInTheDocument()
  })

  it('folds a long list of other senses under the main ones, and the arrow keys unfold it', () => {
    const labels = Array.from({ length: 9 }, (_, i) => ({
      senseId: `en:x#${i}`, coreSenseOrder: null, viTerms: [`nghĩa ${i}`], domain: null, register: null,
      isInflection: false, lemma: null, lemmaEntryId: null,
    }))
    const many = { ...layer, labels }
    render(<MapLayout view={view} layer={many} />)
    const list = screen.getByRole('navigation', { name: 'Các nghĩa' })
    expect(within(list).queryByText('nghĩa 0')).not.toBeInTheDocument()
    expect(within(list).getByRole('button', { name: 'Xem 9 nghĩa khác' })).toHaveAttribute('aria-expanded', 'false')
    for (let i = 0; i < 3; i++) fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    expect(screen.getByRole('heading', { level: 2, name: 'nghĩa 0' })).toBeInTheDocument()
    expect(within(list).getByRole('button', { name: 'nghĩa 0' })).toHaveAttribute('aria-current', 'true')
  })

  it('leaves the arrow keys to any other control on the page', () => {
    render(<><button type="button">khác</button><MapLayout view={view} layer={layer} /></>)
    fireEvent.keyDown(screen.getByRole('button', { name: 'khác' }), { key: 'ArrowDown' })
    expect(screen.getByRole('heading', { level: 2, name: 'bảo hành, giấy bảo hành' })).toBeInTheDocument()
    const list = screen.getByRole('navigation', { name: 'Các nghĩa' })
    fireEvent.keyDown(within(list).getByRole('button', { name: /bảo hành, giấy bảo hành/ }), { key: 'ArrowDown' })
    expect(screen.getByRole('heading', { level: 2, name: 'sự bảo đảm, sự cam đoan' })).toBeInTheDocument()
  })

  it('unfolds the other senses when the next-sense button reaches them, and announces only the title', async () => {
    const labels = Array.from({ length: 9 }, (_, i) => ({
      senseId: `en:x#${i}`, coreSenseOrder: null, viTerms: [`nghĩa ${i}`], domain: null, register: null,
      isInflection: false, lemma: null, lemmaEntryId: null,
    }))
    render(<MapLayout view={view} layer={{ ...layer, labels }} />)
    for (let i = 0; i < 3; i++) await userEvent.click(screen.getByRole('button', { name: /Nghĩa sau/ }))
    const list = screen.getByRole('navigation', { name: 'Các nghĩa' })
    expect(within(list).getByRole('button', { name: 'nghĩa 0' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('article')).not.toHaveAttribute('aria-live')
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent(/^nghĩa 0$/)
  })

  it('counts and titles the forms of another word apart from the other senses', () => {
    const labels = [
      { senseId: 'en:x#1', coreSenseOrder: null, viTerms: ['nghĩa lạ'], domain: null, register: null, isInflection: false, lemma: null, lemmaEntryId: null },
      { senseId: 'en:x#2', coreSenseOrder: null, viTerms: [], domain: null, register: null, isInflection: true, lemma: 'casar', lemmaEntryId: 'es:casar' },
    ]
    const senses = [...view.senses, { id: 'en:x#2', pos: 'verb', glossVi: null, glossEn: 'third-person singular present indicative of casar', senseOrder: 99 }]
    const many = { ...layer, labels }
    render(<MapLayout view={{ ...view, senses }} layer={many} />)
    const list = screen.getByRole('navigation', { name: 'Các nghĩa' })
    expect(within(list).getByText('Là dạng của từ khác')).toBeInTheDocument()
    expect(within(list).getAllByText('ngôi thứ ba số ít hiện tại thức chỉ định của casar').length).toBeGreaterThan(0)
    expect(screen.getByText((_, el) => el?.tagName === 'P' && /^3 nghĩa chính · 1 nghĩa khác · 1 dạng từ/.test(el.textContent ?? ''))).toBeInTheDocument()
  })

  it('shows the usage note, the confusables, the backlinks and the AI note', () => {
    render(<MapLayout view={view} layer={layer} />)
    expect(screen.getByText('Mô tả chung')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'warrant' })).toHaveAttribute('href', '/dictionary/en/warrant')
    expect(screen.getByText('Xuất hiện ở từ khác')).toBeInTheDocument()
    expect(screen.getByText(/AI soạn nghĩa chính, ví dụ và kết hợp từ Wiktionary/)).toBeInTheDocument()
  })
})

describe('ReadLayout', () => {
  it('draws every core sense in full, then the minor senses and a contents list', () => {
    render(<ReadLayout view={view} layer={layer} />)
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent).slice(0, 4)).toEqual([
      'bảo hành, giấy bảo hành', 'sự bảo đảm, sự cam đoan', 'bảo đảm, điều khoản bảo đảm', 'Nghĩa khác và dạng từ · 5',
    ])
    expect(screen.getAllByRole('heading', { level: 3, name: 'Kết hợp hay gặp' })).toHaveLength(3)
    expect(screen.getByText('Nghĩa khác và dạng từ · 5')).toBeInTheDocument()
    const toc = screen.getByRole('navigation', { name: 'Trên trang này' })
    expect(within(toc).getByRole('link', { name: /bảo hành/ })).toHaveAttribute('href', '#sense-1')
    expect(within(toc).getByRole('link', { name: /5 nghĩa khác/ })).toHaveAttribute('href', '#minor-senses')
    expect(document.getElementById('sense-3')).not.toBeNull()
  })
})

describe('ReadLayout contents', () => {
  it('leaves out the contents when there is one section to list', () => {
    render(<ReadLayout view={view} layer={{ ...layer, senses: layer.senses.slice(0, 1), labels: [] }} />)
    expect(screen.queryByRole('navigation', { name: 'Trên trang này' })).not.toBeInTheDocument()
  })
})

describe('GlanceLayout', () => {
  it('lights up what belongs to the sense under the pointer and dims the rest', async () => {
    render(<GlanceLayout view={view} layer={layer} />)
    expect(screen.getByText('Kết hợp hay gặp · 9')).toBeInTheDocument()
    const second = screen.getByRole('article', { name: /Nghĩa 2/ })
    await userEvent.hover(second)
    expect(second.className).toContain('ring-2')
    expect(screen.getByRole('article', { name: /Nghĩa 1/ }).className).toContain('opacity-30')
    expect(screen.getByRole('link', { name: 'no warranty' }).closest('li')?.className).not.toContain('opacity-30')
    expect(screen.getByRole('link', { name: 'warranty period' }).closest('li')?.className).toContain('opacity-30')
    await userEvent.unhover(second)
    expect(screen.getByRole('article', { name: /Nghĩa 1/ }).className).not.toContain('opacity-30')
  })
})
