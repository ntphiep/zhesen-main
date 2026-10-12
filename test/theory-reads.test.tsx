import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { TheoryPath } from '@/components/theory/TheoryReads'
import { BLOCKS_BY_LANG } from '@/lib/theory/blocks'
import { theoryPages } from '@/lib/theory/pages'
import { theoryReads } from '@/lib/theory/reads'
import type { GrammarPoint } from '@/lib/grammar/types'

const point = (key: string, titleVi: string): GrammarPoint => ({
  id: `en:a1:${key}`, lang: 'en', levelScheme: 'CEFR', level: 'A1', categoryVi: null, titleVi, pattern: '', sortOrder: 0,
})
const pages = theoryPages('en', [point('present-simple', 'Thì hiện tại đơn'), point('past-simple', 'Thì quá khứ đơn')], ['A1', 'A2'])
const blocks = BLOCKS_BY_LANG.en
const view = <TheoryPath lang="en" blocks={blocks} counts={{}} pages={pages} />

beforeEach(() => {
  localStorage.clear()
  theoryReads.reset()
})

describe('theoryPages', () => {
  it('lists each block\'s own page, then its pages, in learning order', () => {
    expect(pages[0]).toEqual({ block: 'pronunciation', path: '/theory/en/pronunciation', title: 'Phát âm' })
    const grammar = pages.filter((p) => p.block === 'grammar').map((p) => p.path)
    expect(grammar).toEqual(['/theory/en/grammar', '/theory/en/grammar/a1_present-simple', '/theory/en/grammar/a1_past-simple'])
    expect(pages.filter((p) => p.block === 'vocabulary').map((p) => p.title)).toEqual(['Từ vựng', 'Từ vựng A1', 'Từ vựng A2'])
    expect(pages.some((p) => p.path.includes('/toeic/list/'))).toBe(false)
  })
})

describe('theoryReads', () => {
  it('remembers content pages across a reload and ignores the hubs', () => {
    theoryReads.record('/theory/en', 1)
    theoryReads.record('/theory/en/sentence', 2)
    theoryReads.reset()
    expect([...theoryReads.snapshot().keys()]).toEqual(['/theory/en/sentence'])
    expect(theoryReads.serverSnapshot().size).toBe(0)
  })

  it('reads a damaged key as nothing read', () => {
    localStorage.setItem('zhesen:theory-read', '{"oops":1}')
    expect(theoryReads.snapshot().size).toBe(0)
  })
})

describe('TheoryPath', () => {
  it('offers the first unread page once a page has been read', () => {
    render(view)
    expect(screen.queryByText('Đọc tiếp')).not.toBeInTheDocument()
    act(() => {
      theoryReads.record('/theory/en/pronunciation', 1)
      theoryReads.record('/theory/en/word-class', 2)
    })
    const next = screen.getByRole('link', { name: /Đọc tiếp/ })
    // The word-class block's own page is read; its first class is next.
    expect(next.getAttribute('href')).toMatch(/^\/theory\/en\/word-class\/./)
    expect(screen.getByText('Đã đọc')).toBeInTheDocument()
    expect(screen.getByText(/^Đã đọc 1\/\d+$/)).toBeInTheDocument()
  })

  it('finds a page by its title typed without accents', async () => {
    render(view)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Tìm trang lý thuyết' }), 'qua khu')
    expect(screen.getByRole('link', { name: /Thì quá khứ đơn/ })).toHaveAttribute('href', '/theory/en/grammar/a1_past-simple')
    await userEvent.clear(screen.getByRole('searchbox'))
    await userEvent.type(screen.getByRole('searchbox'), 'zzz')
    expect(screen.getByText('Không tìm thấy trang.')).toBeInTheDocument()
  })
})

describe('hydrating a theory hub with pages read', () => {
  let root: Root | null = null
  let box: HTMLDivElement
  beforeEach(() => { box = document.createElement('div'); document.body.append(box) })
  afterEach(() => { act(() => root?.unmount()); root = null; box.remove() })

  it('matches the server HTML, then shows what was read', async () => {
    localStorage.setItem('zhesen:theory-read', JSON.stringify([['/theory/en/pronunciation', 1]]))
    box.innerHTML = renderToString(view)
    expect(box.textContent).not.toContain('Đọc tiếp')
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    await act(async () => { root = hydrateRoot(box, view) })
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
    expect(box.textContent).toContain('Đọc tiếp')
  })
})
