/** Page arithmetic for the wordlist. Pure, because every off-by-one here is visible:
 *  an empty last page, or a row that no page shows. */

export const PAGE_SIZES = [25, 50, 100, 200] as const
export type PageSize = (typeof PAGE_SIZES)[number]
export const DEFAULT_PAGE_SIZE: PageSize = 50

/** At least one page, so an empty list still reads "trang 1 / 1" rather than "1 / 0". */
export function pageCount(total: number, size: number): number {
  if (size <= 0) return 1
  return Math.max(1, Math.ceil(total / size))
}

export function clampPage(page: number, total: number, size: number): number {
  const last = pageCount(total, size)
  if (!Number.isFinite(page)) return 1
  return Math.min(Math.max(1, Math.trunc(page)), last)
}

export function pageSlice<T>(list: T[], page: number, size: number): T[] {
  const p = clampPage(page, list.length, size)
  return list.slice((p - 1) * size, p * size)
}

/** The 1-based row numbers on the page, for "51 tới 100 trên 425". `from` is 0 on an
 *  empty list, which is what "0 từ" should read. */
export function pageRange(total: number, page: number, size: number): { from: number; to: number } {
  if (total === 0) return { from: 0, to: 0 }
  const p = clampPage(page, total, size)
  const from = (p - 1) * size + 1
  return { from, to: Math.min(p * size, total) }
}

export function isPageSize(n: number): n is PageSize {
  return (PAGE_SIZES as readonly number[]).includes(n)
}
