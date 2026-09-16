/**
 * PostgREST caps every response at a fixed number of rows and says nothing about
 * it: the request succeeds, the array is just short. Asking for `limit 5000`
 * against a table with 5000 matching rows returns 1000 of them and no error.
 *
 * Anything that needs *all* the rows — the wordlist itself, its CSV export, the
 * stats totals — has to page through them rather than trust one call.
 */

/** Confirmed against this project's API: a range request beyond it still stops here. */
export const POSTGREST_MAX_ROWS = 1000

/** Guards against looping forever if a page somehow keeps returning full batches. */
const MAX_PAGES = 100

interface PageResult<T> {
  data: T[] | null
  error: { message: string } | null
}

/**
 * Read every row a query matches, one page at a time.
 *
 * `page` receives an inclusive row range to pass to `.range(from, to)`, and is
 * called again until a short page proves the end has been reached.
 *
 * The query MUST carry an `.order()` on a column unique within the result. A
 * range without one leaves the row order up to the planner, which is free to
 * return it differently per page: the same row then arrives twice and another
 * never arrives at all, with no error anywhere. The counts on the wordlist and
 * the streak both read through here.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = []
  for (let i = 0; i < MAX_PAGES; i++) {
    const from = i * POSTGREST_MAX_ROWS
    const { data, error } = await page(from, from + POSTGREST_MAX_ROWS - 1)
    if (error) throw error
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < POSTGREST_MAX_ROWS) return rows
  }
  throw new Error(`Dừng sau ${MAX_PAGES} trang; truy vấn có vẻ không bao giờ kết thúc.`)
}
