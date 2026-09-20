import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWordlistFilters, LEECH_LAPSES } from '@/lib/hooks/useWordlistFilters'
import type { UserWord } from '@/lib/wordlist/types'

function mk(id: string, over: Partial<UserWord> = {}): UserWord {
  return {
    id, lang: 'en', entryId: null, headword: id, reading: null, ipa: null, pos: null,
    meaningVi: null, meaningEn: null, level: null, example: null, exampleTranslation: null,
    audioUrl: null, notes: null, status: 'new', tags: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: 'x', fsrsDueAt: '2026-01-01T00:00:00Z', fsrsLapses: 0,
    ...over,
  }
}

describe('useWordlistFilters', () => {
  it('filters by tag and toggling the same tag clears the filter', () => {
    const words = [mk('a', { tags: ['du-lich'] }), mk('b', { tags: ['cong-viec'] })]
    const { result } = renderHook(() => useWordlistFilters(words))
    expect(result.current.visible.map((w) => w.id)).toEqual(['a', 'b'])

    act(() => result.current.toggleTagFilter('du-lich'))
    expect(result.current.visible.map((w) => w.id)).toEqual(['a'])

    act(() => result.current.toggleTagFilter('du-lich'))
    expect(result.current.visible.map((w) => w.id)).toEqual(['a', 'b'])
  })

  // "TOEIC" and "Part 5" only mean anything together; one chip at a time cannot
  // express the set a learner is actually after.
  it('narrows by every selected tag at once', () => {
    const words = [
      mk('a', { tags: ['TOEIC', 'Part 5'] }),
      mk('b', { tags: ['TOEIC'] }),
      mk('c', { tags: ['Part 5'] }),
    ]
    const { result } = renderHook(() => useWordlistFilters(words))
    act(() => result.current.toggleTagFilter('TOEIC'))
    expect(result.current.visible.map((w) => w.id)).toEqual(['a', 'b'])

    act(() => result.current.toggleTagFilter('Part 5'))
    expect(result.current.visible.map((w) => w.id)).toEqual(['a'])

    act(() => result.current.toggleTagFilter('TOEIC'))
    expect(result.current.visible.map((w) => w.id)).toEqual(['a', 'c'])
  })

  // Typed without a Vietnamese keyboard, which is how the box is used in practice.
  it('finds a word typed without its diacritics', () => {
    const words = [mk('a', { headword: 'trade', meaningVi: 'thương mại' }), mk('b', { headword: 'dog' })]
    const { result } = renderHook(() => useWordlistFilters(words))
    act(() => result.current.setQuery('thuong mai'))
    expect(result.current.visible.map((w) => w.id)).toEqual(['a'])
  })

  it('searches the note, the example and the tags as well as the meaning', () => {
    const words = [
      mk('a', { notes: 'gặp trong hợp đồng' }),
      mk('b', { example: 'The invoice is overdue.' }),
      mk('c', { tags: ['kế toán'] }),
      mk('d'),
    ]
    const { result } = renderHook(() => useWordlistFilters(words))
    act(() => result.current.setQuery('hop dong'))
    expect(result.current.visible.map((w) => w.id)).toEqual(['a'])
    act(() => result.current.setQuery('invoice'))
    expect(result.current.visible.map((w) => w.id)).toEqual(['b'])
    act(() => result.current.setQuery('ke toan'))
    expect(result.current.visible.map((w) => w.id)).toEqual(['c'])
  })

  it('filters by lang, status, and search text together', () => {
    const words = [
      mk('a', { lang: 'en', status: 'known', headword: 'dog' }),
      mk('b', { lang: 'zh', status: 'known', headword: '猫' }),
      mk('c', { lang: 'en', status: 'new', headword: 'cat' }),
    ]
    const { result } = renderHook(() => useWordlistFilters(words))
    act(() => result.current.setLangFilter('en'))
    act(() => result.current.setStatusFilter('known'))
    expect(result.current.visible.map((w) => w.id)).toEqual(['a'])
  })

  // The scheduler has known which words are overdue all along; the wordlist had
  // no way to ask it, so a learner with 400 words could not find the 12 due today.
  it('keeps only the words the scheduler wants back', () => {
    const words = [
      mk('due', { fsrsDueAt: '2020-01-01T00:00:00Z' }),
      mk('later', { fsrsDueAt: '2099-01-01T00:00:00Z' }),
    ]
    const { result } = renderHook(() => useWordlistFilters(words))
    act(() => result.current.setReviewFilter('due'))
    expect(result.current.visible.map((w) => w.id)).toEqual(['due'])
  })

  it('keeps only the words that keep being forgotten', () => {
    const words = [mk('hard', { fsrsLapses: LEECH_LAPSES }), mk('easy', { fsrsLapses: LEECH_LAPSES - 1 })]
    const { result } = renderHook(() => useWordlistFilters(words))
    act(() => result.current.setReviewFilter('leech'))
    expect(result.current.visible.map((w) => w.id)).toEqual(['hard'])
  })

  it('sorts by how often a word has been missed, hardest last then first', () => {
    const words = [mk('a', { fsrsLapses: 1 }), mk('b', { fsrsLapses: 5 }), mk('c', { fsrsLapses: 0 })]
    const { result } = renderHook(() => useWordlistFilters(words))
    act(() => result.current.toggleSort('fsrsLapses'))
    expect(result.current.visible.map((w) => w.id)).toEqual(['c', 'a', 'b'])
    act(() => result.current.toggleSort('fsrsLapses'))
    expect(result.current.visible.map((w) => w.id)).toEqual(['b', 'a', 'c'])
  })

  it('sorts by due date', () => {
    const words = [
      mk('late', { fsrsDueAt: '2030-01-01T00:00:00Z' }),
      mk('soon', { fsrsDueAt: '2026-01-01T00:00:00Z' }),
    ]
    const { result } = renderHook(() => useWordlistFilters(words))
    act(() => result.current.toggleSort('fsrsDueAt'))
    expect(result.current.visible.map((w) => w.id)).toEqual(['soon', 'late'])
  })

  it('filters by level and by part of speech, offering only what the list holds', () => {
    const words = [
      mk('a', { level: 'B1', pos: 'noun' }),
      mk('b', { level: 'A1', pos: 'verb' }),
      mk('c', { level: null, pos: null }),
    ]
    const { result } = renderHook(() => useWordlistFilters(words))
    expect(result.current.levelOptions).toEqual(['A1', 'B1'])

    act(() => result.current.setLevelFilter('B1'))
    expect(result.current.visible.map((w) => w.id)).toEqual(['a'])

    act(() => result.current.setLevelFilter(''))
    // posOptions carries the group, not a label: the filter matches on `key` so a word
    // that is several parts of speech at once appears under each of them.
    expect(result.current.posOptions.map((g) => g.abbr)).toEqual(['n.', 'v.'])
    act(() => result.current.setPosFilter(result.current.posOptions[0].key))
    expect(result.current.visible).toHaveLength(1)
  })

  // A word the pipeline never graded is not "before A1"; it belongs last either way.
  it('sorts by level and keeps ungraded words at the end', () => {
    const words = [mk('none', { level: null }), mk('b1', { level: 'B1' }), mk('a1', { level: 'A1' })]
    const { result } = renderHook(() => useWordlistFilters(words))
    act(() => result.current.toggleSort('level'))
    expect(result.current.visible.map((w) => w.id)).toEqual(['a1', 'b1', 'none'])
    act(() => result.current.toggleSort('level'))
    expect(result.current.visible.map((w) => w.id)).toEqual(['b1', 'a1', 'none'])
  })

  it('sorts by headword and toggles direction on repeated clicks', () => {
    const words = [mk('a', { headword: 'banana' }), mk('b', { headword: 'apple' })]
    const { result } = renderHook(() => useWordlistFilters(words))
    act(() => result.current.toggleSort('headword'))
    expect(result.current.visible.map((w) => w.id)).toEqual(['b', 'a'])
    act(() => result.current.toggleSort('headword'))
    expect(result.current.visible.map((w) => w.id)).toEqual(['a', 'b'])
  })

  // The hook runs once on the server, where `window` does not exist, and again
  // in the browser. Reading innerWidth and localStorage in the initial state
  // meant a phone got a table from the server and a card grid from the first
  // client render: React discarded the server HTML and rebuilt all 400 rows.
  // Both sides must start from the same answer and settle afterwards.
  it('starts from the same view on both sides, then settles', () => {
    const width = window.innerWidth
    try {
      Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true })
      const { result } = renderHook(() => useWordlistFilters([mk('a')]))
      // renderHook has already flushed effects, so this is the settled value.
      expect(result.current.view).toBe('card')
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
    }
  })

  it('honours a stored choice over the screen width', () => {
    const width = window.innerWidth
    window.localStorage.setItem('wordlist_view', 'table')
    try {
      Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true })
      const { result } = renderHook(() => useWordlistFilters([mk('a')]))
      expect(result.current.view).toBe('table')
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
      window.localStorage.removeItem('wordlist_view')
    }
  })
})
