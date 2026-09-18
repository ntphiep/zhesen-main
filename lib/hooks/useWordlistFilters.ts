'use client'
import { useMemo, useState } from 'react'
import type { LangCode } from '@/lib/languages'
import { isDueAt } from '@/lib/wordlist/format'
import type { UserWord, WordStatus } from '@/lib/wordlist/types'
import { posGroup } from '@/lib/dictionary/pos'
import { useStoredView, type ViewMode } from './useStoredView'

export type { ViewMode }
export type SortKey = 'headword' | 'createdAt' | 'fsrsDueAt' | 'fsrsLapses' | 'level' | 'pos'
/** Which words the review columns single out. '' is every word. */
export type ReviewFilter = '' | 'due' | 'leech'

/** A word missed this often needs a different approach, not more repetitions. Anki's leech
 *  threshold is eight; this list is reviewed far less often, so three is already the signal. */
export const LEECH_LAPSES = 3
export type SortDir = 'asc' | 'desc'

/** Drop diacritics so "thuong mai" finds "thương mại": the box gets typed without a
 *  Vietnamese keyboard often enough that exact matching hides words the learner has. */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // "đ" carries no combining mark, so NFD leaves it alone and "hop dong" would still
    // miss "hợp đồng".
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

/** Rows with nothing in the sorted column stay at the end whichever way it is sorted: an
 *  ungraded word is not "before A1". Returns 0 when both sides have a value. */
function emptyRank(a: UserWord, b: UserWord, key: SortKey): number {
  if (key !== 'level' && key !== 'pos') return 0
  const x = a[key], y = b[key]
  if (!x === !y) return 0
  return x ? -1 : 1
}

function compare(a: UserWord, b: UserWord, key: SortKey): number {
  switch (key) {
    case 'headword': return a.headword.localeCompare(b.headword)
    case 'fsrsDueAt': return a.fsrsDueAt.localeCompare(b.fsrsDueAt)
    // Ties on lapses are common, so the due date breaks them and the order stays stable
    // between renders.
    case 'fsrsLapses': return a.fsrsLapses - b.fsrsLapses || a.fsrsDueAt.localeCompare(b.fsrsDueAt)
    case 'level': return (a.level ?? '').localeCompare(b.level ?? '')
    case 'pos': return (a.pos ?? '').localeCompare(b.pos ?? '')
    default: return a.createdAt.localeCompare(b.createdAt)
  }
}

/** Filter, sort and view-mode state for the wordlist table, plus the derived visible list.
 *  Kept out of WordlistClient so the filtering can be tested without the table. */
export function useWordlistFilters(words: UserWord[]) {
  const [query, setQuery] = useState('')
  const [langFilter, setLangFilter] = useState<LangCode | ''>('')
  const [statusFilter, setStatusFilter] = useState<WordStatus | ''>('')
  // A set, not one tag: "TOEIC" and "Part 5" only mean something together, and a single-tag
  // filter cannot express that intersection.
  const [tagFilter, setTagFilter] = useState<ReadonlySet<string>>(() => new Set())
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('')
  // CEFR or HSK band, and part of speech.
  const [levelFilter, setLevelFilter] = useState('')
  const [posFilter, setPosFilter] = useState('')
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
      if (levelFilter && w.level !== levelFilter) return false
      if (posFilter && (posGroup(w.pos)?.labelVi ?? w.pos ?? '') !== posFilter) return false
      if (reviewFilter === 'due' && !isDueAt(w.fsrsDueAt)) return false
      if (reviewFilter === 'leech' && w.fsrsLapses < LEECH_LAPSES) return false
      return true
    })

    list = [...list].sort((a, b) => {
      const empties = emptyRank(a, b, sortKey)
      if (empties !== 0) return empties
      const cmp = compare(a, b, sortKey)
      return sortDir === 'asc' ? cmp : -cmp
    })

    return list
  }, [words, query, langFilter, statusFilter, tagFilter, reviewFilter, levelFilter, posFilter, sortKey, sortDir])

  // The options offered are the values the list actually holds: a wordlist with no Spanish
  // verbs must not offer to filter for them.
  const levelOptions = useMemo(
    () => [...new Set(words.map((w) => w.level).filter((l): l is string => !!l))].sort(),
    [words],
  )
  const posOptions = useMemo(
    () => [...new Set(words.map((w) => posGroup(w.pos)?.labelVi ?? w.pos).filter((p): p is string => !!p))].sort(),
    [words],
  )

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
    levelFilter, setLevelFilter, levelOptions,
    posFilter, setPosFilter, posOptions,
    tagFilter, toggleTagFilter,
    sortKey, sortDir, toggleSort,
    view, toggleView,
    visible,
  }
}
