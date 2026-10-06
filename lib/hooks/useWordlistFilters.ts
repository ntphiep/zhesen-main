'use client'
import { useMemo, useState } from 'react'
import type { LangCode } from '@/lib/languages'
import { isDueAt } from '@/lib/wordlist/format'
import { KIND_LABEL, LEECH_LAPSES, WORD_KINDS, wordKind, type UserWord, type WordKind, type WordStatus } from '@/lib/wordlist/types'
import { posGroups, splitPos, type PosGroup } from '@/lib/dictionary/pos'
import { columnValue, type SortKey } from '@/lib/wordlist/columns'
import { useStoredView, type ViewMode } from './useStoredView'

export type { ViewMode }
export type { SortKey }
export { LEECH_LAPSES }
/** Which words the review columns single out. '' is every word. */
export type ReviewFilter = '' | 'due' | 'leech'

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
  const aEmpty = columnValue(a, key) === ''
  const bEmpty = columnValue(b, key) === ''
  if (aEmpty === bEmpty) return 0
  return aEmpty ? 1 : -1
}

function compare(a: UserWord, b: UserWord, key: SortKey): number {
  const x = columnValue(a, key), y = columnValue(b, key)
  return typeof x === 'number' && typeof y === 'number'
    ? x - y
    : String(x).localeCompare(String(y), 'vi')
}

/** Ties are common on a status, a level or a lapse count. The headword settles them, and
 *  the id settles two words spelled the same, so the order does not shuffle between
 *  renders. Never reversed: "mới nhất trước" should not also spell the same-day words
 *  backwards. */
function tieBreak(a: UserWord, b: UserWord): number {
  return a.headword.localeCompare(b.headword, 'vi') || a.id.localeCompare(b.id)
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
  // A word, a phrasal verb, an idiom, a collocation or another phrase.
  const [kindFilter, setKindFilter] = useState<WordKind | ''>('')
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
      // Matches on any of the word's parts of speech: a word that is both a noun and a
      // verb belongs in both filters.
      if (posFilter && !posGroups(splitPos(w.pos)).some((g) => g.key === posFilter)) return false
      if (kindFilter && wordKind(w) !== kindFilter) return false
      if (reviewFilter === 'due' && (w.status === 'known' || !isDueAt(w.fsrsDueAt))) return false
      if (reviewFilter === 'leech' && w.fsrsLapses < LEECH_LAPSES) return false
      return true
    })

    list = [...list].sort((a, b) => {
      const empties = emptyRank(a, b, sortKey)
      if (empties !== 0) return empties
      const cmp = compare(a, b, sortKey)
      if (cmp !== 0) return sortDir === 'asc' ? cmp : -cmp
      return tieBreak(a, b)
    })

    return list
  }, [words, query, langFilter, statusFilter, tagFilter, reviewFilter, levelFilter, posFilter, kindFilter, sortKey, sortDir])

  // The options offered are the values the list actually holds: a wordlist with no Spanish
  // verbs must not offer to filter for them.
  const levelOptions = useMemo(
    () => [...new Set(words.map((w) => w.level).filter((l): l is string => !!l))].sort(),
    [words],
  )
  const posOptions = useMemo(() => {
    const byKey = new Map<string, PosGroup>()
    for (const w of words) for (const g of posGroups(splitPos(w.pos))) byKey.set(g.key, g)
    return [...byKey.values()].sort((a, b) => a.labelVi.localeCompare(b.labelVi, 'vi'))
  }, [words])

  const kindOptions = useMemo(() => {
    const held = new Set(words.map(wordKind))
    return WORD_KINDS.filter((k) => held.has(k)).map((k) => ({ key: k, label: KIND_LABEL[k] }))
  }, [words])

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
    kindFilter, setKindFilter, kindOptions,
    tagFilter, toggleTagFilter,
    sortKey, sortDir, toggleSort,
    view, toggleView,
    visible,
  }
}
