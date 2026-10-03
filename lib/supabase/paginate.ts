/**
 * PostgREST caps every response at a fixed number of rows and says nothing about it: the
 * request succeeds and the array is just short. Anything needing all the rows -- the
 * wordlist, its CSV export, the stats totals -- must page rather than trust one call.
 */

/** Confirmed against this project's API: a range request beyond it still stops here. */
export const POSTGREST_MAX_ROWS = 1000

/** Guards against looping forever if a page somehow keeps returning full batches. */
export const MAX_PAGES = 100

interface PageResult<T> {
  data: T[] | null
  error: { message: string } | null
}

/** Read every row a query matches, one page at a time; `page` takes an inclusive range for
 *  `.range(from, to)`. The query MUST carry an `.order()` on a column unique within the
 *  result, or the planner may order pages differently and rows duplicate or vanish. */
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
  throw new Error(`stopped after ${MAX_PAGES} pages; the query looks unbounded`)
}

/** An `.in()` list travels in the query string, and CloudFront answers a URL over 8,192
 *  bytes with 414. Han costs 9 bytes a character once encoded: the segment candidates of
 *  zh:吃's examples overflowed it and the word page failed with 500. */
export const MAX_IN_LIST_BYTES = 6000

/** Split `values` into lists whose encoded length stays under `maxBytes` each. */
export function chunkForUrl(values: string[], maxBytes = MAX_IN_LIST_BYTES): string[][] {
  const chunks: string[][] = []
  let chunk: string[] = []
  let size = 0
  for (const value of values) {
    // Quotes and the separating comma, which PostgREST may add around a value.
    const cost = encodeURIComponent(value).length + 9
    if (chunk.length > 0 && size + cost > maxBytes) {
      chunks.push(chunk)
      chunk = []
      size = 0
    }
    chunk.push(value)
    size += cost
  }
  if (chunk.length > 0) chunks.push(chunk)
  return chunks
}

/** Run an `.in()` query once per URL-sized chunk of `values`, in parallel, and join the rows. */
export async function fetchInChunks<T>(
  values: string[],
  query: (chunk: string[]) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const results = await Promise.all(chunkForUrl(values).map(query))
  const rows: T[] = []
  for (const { data, error } of results) {
    if (error) throw error
    rows.push(...(data ?? []))
  }
  return rows
}
