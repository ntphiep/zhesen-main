import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WordTable } from '@/components/wordlist/WordTable'
import { DEFAULT_PREFS, orderedColumns, togglePinned, toggleHidden } from '@/lib/wordlist/columns'
import type { UserWord } from '@/lib/wordlist/types'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

function mk(id: string, over: Partial<UserWord> = {}): UserWord {
  return {
    id, lang: 'en', entryId: null, headword: id, reading: null, ipa: null, pos: null,
    meaningVi: null, meaningEn: null, level: null, example: null, exampleTranslation: null,
    audioUrl: null, notes: null, status: 'new', tags: [], createdAt: '2026-01-01T00:00:00Z',
    updatedAt: 'x', fsrsDueAt: '2026-01-01T00:00:00Z', fsrsLapses: 0,
    ...over,
  }
}

const words = [mk('dog', { ipa: '/dɔːɡ/', meaningVi: 'Con chó', level: 'A1' }), mk('cat')]

function show(prefs = DEFAULT_PREFS, over: Partial<React.ComponentProps<typeof WordTable>> = {}) {
  const props: React.ComponentProps<typeof WordTable> = {
    words,
    columns: orderedColumns(prefs),
    pinned: prefs.pinned,
    sortKey: 'createdAt',
    sortDir: 'desc',
    onToggleSort: vi.fn(),
    selected: new Set<string>(),
    allSelected: false,
    onToggleSelectAll: vi.fn(),
    onToggleSelect: vi.fn(),
    expandedId: null,
    onToggleDetail: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    ...over,
  }
  return { ...render(<WordTable {...props} />), props }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('WordTable', () => {
  it('draws the columns the preferences ask for, and no others', () => {
    show()
    expect(screen.getByRole('columnheader', { name: /Nghĩa$/ })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /Ghi chú/ })).toBeNull()
    expect(screen.getByText('Con chó')).toBeInTheDocument()
  })

  it('draws a column the reader turned on', () => {
    show(toggleHidden(DEFAULT_PREFS, 'notes'))
    expect(screen.getByRole('columnheader', { name: /Ghi chú/ })).toBeInTheDocument()
  })

  it('stops drawing a column the reader turned off', () => {
    show(toggleHidden(DEFAULT_PREFS, 'ipa'))
    expect(screen.queryByRole('columnheader', { name: /IPA/ })).toBeNull()
    expect(screen.queryByText('/dɔːɡ/')).toBeNull()
  })

  it('asks for a different sort when a header is clicked', async () => {
    const { props } = show()
    await userEvent.click(screen.getByRole('button', { name: /Trình độ/ }))
    expect(props.onToggleSort).toHaveBeenCalledWith('level')
  })

  it('marks the sorted column for a screen reader', () => {
    show(DEFAULT_PREFS, { sortKey: 'headword', sortDir: 'asc' })
    // The arrow is part of the header, so "Từ ↑" also proves the direction is drawn.
    expect(screen.getByRole('columnheader', { name: /^Từ\s*↑$/ })).toHaveAttribute('aria-sort', 'ascending')
  })

  // The audio button has nothing to order by, so its header is a label and not a control.
  it('offers no sort on the audio column', () => {
    show()
    const header = screen.getByRole('columnheader', { name: 'Audio' })
    expect(within(header).queryByRole('button')).toBeNull()
  })

  // A pinned column holds the left edge while the rest scroll sideways, and needs an
  // opaque background or the scrolled columns show through it.
  it('sticks a pinned column to the left edge behind its own background', () => {
    show(togglePinned(DEFAULT_PREFS, 'meaningVi'))
    const cell = screen.getByText('Con chó').closest('td')
    expect(cell?.className).toContain('sticky')
    expect(cell?.className).toContain('bg-white')
    // Behind the checkbox column, which is always first.
    expect(cell?.style.left).toBe('204px')
  })

  // Measured on a 390px phone: the content box is 342px, so three 160px pinned columns
  // cover each other and leave nothing to scroll.
  it('holds one narrower column on a phone however many are pinned', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((media: string) => ({
      matches: media.includes('max-width'), media, onchange: null,
      addListener() {}, removeListener() {},
      addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
    }) as MediaQueryList)

    let prefs = togglePinned(DEFAULT_PREFS, 'ipa')
    prefs = togglePinned(prefs, 'meaningVi')
    show(prefs)

    expect(screen.getByText('dog').closest('td')?.style.width).toBe('120px')
    // Behind the 44px checkbox column, and the second pin scrolls instead of stacking.
    expect(screen.getByText('dog').closest('td')?.style.left).toBe('44px')
    expect(screen.getByText('/dɔːɡ/').closest('td')?.className).not.toContain('sticky')
    expect(screen.getByText('Con chó').closest('td')?.className).not.toContain('sticky')
  })

  it('leaves an unpinned column to scroll with the table', () => {
    show()
    expect(screen.getByText('Con chó').closest('td')?.className).not.toContain('sticky')
  })

  // A reader who ticked some rows must not be shown an empty box whose next click
  // selects everything instead of clearing what they chose.
  it('marks the header checkbox as partly selected', () => {
    show(DEFAULT_PREFS, { selected: new Set(['dog']), allSelected: false })
    const box = screen.getByRole('checkbox', { name: 'Chọn tất cả' }) as HTMLInputElement
    expect(box.indeterminate).toBe(true)
    expect(box.checked).toBe(false)
  })

  it('leaves the header checkbox plain when nothing is selected', () => {
    show()
    expect((screen.getByRole('checkbox', { name: 'Chọn tất cả' }) as HTMLInputElement).indeterminate)
      .toBe(false)
  })

  it('spans the detail row across every column that is drawn', () => {
    show(DEFAULT_PREFS, { expandedId: 'dog' })
    const detail = document.querySelector('td[colspan]')
    expect(detail?.getAttribute('colspan')).toBe(String(orderedColumns(DEFAULT_PREFS).length + 2))
  })
})
