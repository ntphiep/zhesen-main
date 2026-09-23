'use client'
import { useMemo, useState } from 'react'
import {
  clampPage, DEFAULT_PAGE_SIZE, isPageSize, pageCount, pageRange, pageSlice, type PageSize,
} from '@/lib/wordlist/paginate'
import { useStoredPref } from './useStoredPref'

const SIZE_KEY = 'wordlist_page_size'

function parseSize(raw: string | null): PageSize {
  const n = Number(raw)
  return raw !== null && isPageSize(n) ? n : DEFAULT_PAGE_SIZE
}

const serializeSize = (n: PageSize) => String(n)

/** One page of a list. `signature` identifies the filter set: when it changes the reader
 *  goes back to page one, so narrowing 400 words to 12 on page 7 shows the twelve. */
export function usePagedList<T>(list: T[], signature: string) {
  const [pageSize, setStoredSize] = useStoredPref<PageSize>(SIZE_KEY, parseSize, serializeSize)
  const [page, setPage] = useState(1)

  const [prevSignature, setPrevSignature] = useState(signature)
  if (signature !== prevSignature) {
    setPrevSignature(signature)
    setPage(1)
  }

  // Clamped on the way out rather than in an effect: an effect would render the empty
  // page once before correcting it.
  const total = list.length
  const current = clampPage(page, total, pageSize)
  const items = useMemo(() => pageSlice(list, current, pageSize), [list, current, pageSize])
  const { from, to } = pageRange(total, current, pageSize)

  function setPageSize(size: PageSize) {
    // Keep the first row of the current page in view instead of jumping to the top:
    // changing 50 to 25 on page 3 lands on the page holding row 101.
    const firstRow = (current - 1) * pageSize
    setStoredSize(size)
    setPage(Math.floor(firstRow / size) + 1)
  }

  return {
    items,
    page: current,
    setPage: (p: number) => setPage(clampPage(p, total, pageSize)),
    pageSize,
    setPageSize,
    pageCount: pageCount(total, pageSize),
    total,
    from,
    to,
  }
}
