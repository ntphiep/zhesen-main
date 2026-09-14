'use client'
import { useMemo, useState } from 'react'
import type { LangCode } from '@/lib/languages'
import type { UserWord, WordStatus } from '@/lib/wordlist/types'
import { useStoredView, type ViewMode } from './useStoredView'

export type { ViewMode }
export type SortKey = 'headword' | 'createdAt' | 'fsrsDueAt' | 'fsrsLapses'
/** Which words the review columns single out. '' is every word. */
export type ReviewFilter = '' | 'due' | 'leech'

/** A word missed this often is one the learner is not going to get from more of
 *  the same repetitions. Anki calls it a leech at eight; this list is reviewed
 *  far less often than an Anki deck, so three is already the signal. */
export const LEECH_LAPSES = 3
export type SortDir = 'asc' | 'desc'

/** Drop diacritics so "thuong mai" finds "thương mại": the list box gets typed
 *  without a Vietnamese keyboard often enough that exact matching hides words the
 *  learner knows are there. */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // "đ" carries no combining mark, so NFD leaves it alone and "hop dong"
    // would still miss "hợp đồng".
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
}

/** Every field worth searching. `notes` and `example` are here because a learner
 *  who wrote "gặp trong hợp đồng" on a word expects to find it by that note. */
function haystack(w: UserWord): string {
  return fold([w.headword, w.reading, w.meaningVi, w.meaningEn, w.example, w.notes, ...w.tags]
    .filter(Boolean).join(' '))
}

/** Whether the scheduler wants this word back already. `now` is a parameter with a
 *  default so the clock is read here and not in the hook body, which React 19's
 *  purity rule forbids. */
function isDue(w: UserWord, now: number = Date.now()): boolean {
  return Date.parse(w.fsrsDueAt) <= now
}

function compare(a: UserWord, b: UserWord, key: SortKey): number {
  switch (key) {
    case 'headword': return a.headword.localeCompare(b.headword)
    case 'fsrsDueAt': return a.fsrsDueAt.localeCompare(b.fsrsDueAt)
    // Ties on lapses are common -- most words have none -- so the due date breaks
    // them and the hardest words stay in a stable order between renders.
    case 'fsrsLapses': return a.fsrsLapses - b.fsrsLapses || a.fsrsDueAt.localeCompare(b.fsrsDueAt)
    default: return a.createdAt.localeCompare(b.createdAt)
  }
}

/** Filter/sort/view-mode state for the wordlist table, plus the derived visible list.
 * Pulled out of WordlistClient so the filtering logic can be tested and reasoned about
 * on its own, independent of the (large) table/card rendering. */
export function useWordlistFilters(words: UserWord[]) {
  const [query, setQuery] = useState('')
  const [langFilter, setLangFilter] = useState<LangCode | ''>('')
  const [statusFilter, setStatusFilter] = useState<WordStatus | ''>('')
  // A set, not one tag: "TOEIC" and "Part 5" only mean something together, and a
  // single-tag filter cannot express the intersection a learner is after.
  const [tagFilter, setTagFilter] = useState<ReadonlySet<string>>(() => new Set())
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('')
  const [sortKey, setSortKey] = useState<SortKey>('createdAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [view, toggleView] = useStoredView()

  const visible = useMemo(() => {
    const q = fold(query.trim())
    let list = words.filter((w) => {
      if (langFilter && w.lang !== langFilter) return false
      if (statusFilter && w.status !== statusFilter) return false
      // Every selected tag has to be on the word: the chips narrow, they do not widen.
      for (const t of tagFilter) if (!w.tags.includes(t)) return false
      if (q && !haystack(w).includes(q)) return false
      if (reviewFilter === 'due' && !isDue(w)) return false
      if (reviewFilter === 'leech' && w.fsrsLapses < LEECH_LAPSES) return false
      return true
    })

    list = [...list].sort((a, b) => {
      const cmp = compare(a, b, sortKey)
      return sortDir === 'asc' ? cmp : -cmp
    })

    return list
  }, [words, query, langFilter, statusFilter, tagFilter, reviewFilter, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function toggleTagFilter(tag: string) {
    setTagFilter((prev) => {
      const next = new Set(prev)
      if (!next.delete(tag)) next.add(tag)
      return next
    })
  }

  return {
    query, setQuery,
    langFilter, setLangFilter,
    statusFilter, setStatusFilter,
    reviewFilter, setReviewFilter,
    tagFilter, toggleTagFilter,
    sortKey, sortDir, toggleSort,
    view, toggleView,
    visible,
  }
}
