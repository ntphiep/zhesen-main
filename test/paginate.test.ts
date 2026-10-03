import { describe, it, expect, vi } from 'vitest'
import {
  chunkForUrl, fetchAllRows, fetchInChunks, MAX_IN_LIST_BYTES, MAX_PAGES, POSTGREST_MAX_ROWS,
} from '@/lib/supabase/paginate'

const rows = (n: number, offset = 0) => Array.from({ length: n }, (_, i) => ({ id: offset + i }))

describe('fetchAllRows', () => {
  it('stops after one call when the first page is short', async () => {
    const page = vi.fn(async () => ({ data: rows(3), error: null }))
    await expect(fetchAllRows(page)).resolves.toHaveLength(3)
    expect(page).toHaveBeenCalledTimes(1)
    expect(page).toHaveBeenCalledWith(0, POSTGREST_MAX_ROWS - 1)
  })

  it('keeps asking while pages come back full', async () => {
    const page = vi.fn(async (from: number) => ({
      data: from === 0 ? rows(POSTGREST_MAX_ROWS) : rows(7, POSTGREST_MAX_ROWS),
      error: null,
    }))
    const out = await fetchAllRows(page)
    expect(out).toHaveLength(POSTGREST_MAX_ROWS + 7)
    expect(page).toHaveBeenNthCalledWith(2, POSTGREST_MAX_ROWS, 2 * POSTGREST_MAX_ROWS - 1)
  })

  it('treats an exactly-full last page as needing one more look', async () => {
    const page = vi.fn(async (from: number) => ({
      data: from === 0 ? rows(POSTGREST_MAX_ROWS) : [],
      error: null,
    }))
    await expect(fetchAllRows(page)).resolves.toHaveLength(POSTGREST_MAX_ROWS)
    expect(page).toHaveBeenCalledTimes(2)
  })

  it('surfaces the error instead of returning a partial list', async () => {
    const page = vi.fn(async () => ({ data: null, error: { message: 'nổ' } }))
    await expect(fetchAllRows(page)).rejects.toMatchObject({ message: 'nổ' })
  })

  it('treats a null data with no error as the end', async () => {
    const page = vi.fn(async () => ({ data: null, error: null }))
    await expect(fetchAllRows(page)).resolves.toEqual([])
  })

  it('gives up rather than looping forever if pages never run short', async () => {
    const page = vi.fn(async () => ({ data: rows(POSTGREST_MAX_ROWS), error: null }))
    // The page cap, not the wording: the guard is that it stops, and says after how many.
    await expect(fetchAllRows(page)).rejects.toThrow(new RegExp(String(MAX_PAGES)))
    expect(page).toHaveBeenCalledTimes(MAX_PAGES)
  })
})

describe('chunkForUrl', () => {
  // The segment candidates of zh:吃's examples: two-to-eight-character Han runs.
  const han = Array.from({ length: 900 }, (_, i) => String.fromCodePoint(0x4e00 + i) + '吃')

  it('keeps every encoded list under the byte budget and loses no value', () => {
    const chunks = chunkForUrl(han)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(encodeURIComponent(chunk.join(',')).length).toBeLessThan(MAX_IN_LIST_BYTES)
    }
    expect(chunks.flat()).toEqual(han)
  })

  it('returns one list for a short input and none for an empty one', () => {
    expect(chunkForUrl(['dog', 'cat'])).toEqual([['dog', 'cat']])
    expect(chunkForUrl([])).toEqual([])
  })
})

describe('fetchInChunks', () => {
  it('queries each chunk and joins the rows', async () => {
    const query = vi.fn(async (chunk: string[]) => ({ data: chunk.map((v) => ({ v })), error: null }))
    const values = Array.from({ length: 3000 }, (_, i) => `word${i}`)
    const out = await fetchInChunks(values, query)
    expect(query.mock.calls.length).toBeGreaterThan(1)
    expect(out.map((r) => r.v)).toEqual(values)
  })

  it('surfaces an error from any chunk', async () => {
    const query = vi.fn(async () => ({ data: null, error: { message: 'nổ' } }))
    await expect(fetchInChunks(['a'], query)).rejects.toMatchObject({ message: 'nổ' })
  })
})
