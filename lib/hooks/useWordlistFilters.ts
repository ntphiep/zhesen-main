'use client'
import { useMemo, useState } from 'react'
import type { LangCode } from '@/lib/languages'
import type { UserWord, WordStatus } from '@/lib/wordlist/types'

export type ViewMode = 'table' | 'card'
export type SortKey = 'headword' | 'createdAt'
export type SortDir = 'asc' | 'desc'

function getInitialView(): ViewMode {
  if (typeof window === 'undefined') return 'table'
  const saved = window.localStorage.getItem('wordlist_view')
  return saved === 'card' ? 'card' : 'table'
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
    window.localStorage.setItem('wordlist_view', v)
  }

  function toggleTagFilter(tag: string) {
    setTagFilter((prev) => (prev === tag ? null : tag))
  }

  return {
    query, setQuery,
    langFilter, setLangFilter,
    statusFilter, setStatusFilter,
    tagFilter, toggleTagFilter, setTagFilter,
    sortKey, sortDir, toggleSort,
    view, toggleView,
    visible,
  }
}

export type WordlistFilters = ReturnType<typeof useWordlistFilters>
