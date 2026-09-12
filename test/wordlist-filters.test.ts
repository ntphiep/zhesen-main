import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWordlistFilters } from '@/lib/hooks/useWordlistFilters'
import type { UserWord } from '@/lib/wordlist/types'

function mk(id: string, over: Partial<UserWord> = {}): UserWord {
  return {
    id, lang: 'en', entryId: null, headword: id, reading: null, ipa: null, pos: null,
    meaningVi: null, meaningEn: null, level: null, example: null, exampleTranslation: null,
    audioUrl: null, notes: null, status: 'new', tags: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: 'x',
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

  it('sorts by headword and toggles direction on repeated clicks', () => {
    const words = [mk('a', { headword: 'banana' }), mk('b', { headword: 'apple' })]
    const { result } = renderHook(() => useWordlistFilters(words))
    act(() => result.current.toggleSort('headword'))
    expect(result.current.visible.map((w) => w.id)).toEqual(['b', 'a'])
    act(() => result.current.toggleSort('headword'))
    expect(result.current.visible.map((w) => w.id)).toEqual(['a', 'b'])
  })
})
