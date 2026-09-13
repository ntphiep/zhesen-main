'use client'
import { useMemo, useState } from 'react'
import type { LangCode } from '@/lib/languages'
import type { UserWord, WordStatus } from '@/lib/wordlist/types'

export type ViewMode = 'table' | 'card'
export type SortKey = 'headword' | 'createdAt'
export type SortDir = 'asc' | 'desc'

/** Width below which the eleven-column table cannot be read without scrolling
 * sideways; matches Tailwind's `lg`. */
const TABLE_MIN_WIDTH = 1024

/** Storage can be full or blocked, and neither is worth a crash -- same guard as
 *  lib/dictionary/recent.ts. A lost view preference costs one click. */
function readStored(): string | null {
  try { return window.localStorage.getItem('wordlist_view') } catch { return null }
}

function getInitialView(): ViewMode {
  if (typeof window === 'undefined') return 'table'
  const saved = readStored()
  if (saved === 'card' || saved === 'table') return saved
  // Without a stored choice, pick by what fits: on a phone the table clipped its
  // last columns off the screen, and cards say the same thing in one column.
  return window.innerWidth < TABLE_MIN_WIDTH ? 'card' : 'table'
}

/** Filter/sort/view-mode state for the wordlist table, plus the derived visible list.
 * Pulled out of WordlistClient so the filtering logic can be tested and reasoned about
 * on its own, independent of the (large) table/card rendering. */
export function useWordlistFilters(words: UserWord[]) {
  const [query, setQuery] = useState('')
  const [langFilter, setLangFilter] = useState<LangCode | ''>('')
  const [statusFilter, setStatusFilter] = useState<WordStatus | ''>('')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('createdAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [view, setView] = useState<ViewMode>(getInitialView)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = words.filter((w) => {
      if (langFilter && w.lang !== langFilter) return false
      if (statusFilter && w.status !== statusFilter) return false
      if (tagFilter && !w.tags.includes(tagFilter)) return false
      if (q) {
        const inHead = w.headword.toLowerCase().includes(q)
        const inMeaningVi = (w.meaningVi ?? '').toLowerCase().includes(q)
        const inMeaningEn = (w.meaningEn ?? '').toLowerCase().includes(q)
        if (!inHead && !inMeaningVi && !inMeaningEn) return false
      }
      return true
    })

    list = [...list].sort((a, b) => {
      const cmp = sortKey === 'headword' ? a.headword.localeCompare(b.headword) : a.createdAt.localeCompare(b.createdAt)
      return sortDir === 'asc' ? cmp : -cmp
    })

    return list
  }, [words, query, langFilter, statusFilter, tagFilter, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function toggleView(v: ViewMode) {
    setView(v)
    try { window.localStorage.setItem('wordlist_view', v) } catch { /* see readStored */ }
  }

  function toggleTagFilter(tag: string) {
    setTagFilter((prev) => (prev === tag ? null : tag))
  }

  return {
    query, setQuery,
    langFilter, setLangFilter,
    statusFilter, setStatusFilter,
    tagFilter, toggleTagFilter,
    sortKey, sortDir, toggleSort,
    view, toggleView,
    visible,
  }
}
