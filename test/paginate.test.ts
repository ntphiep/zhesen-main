import { describe, it, expect, vi } from 'vitest'
import { fetchAllRows, MAX_PAGES, POSTGREST_MAX_ROWS } from '@/lib/supabase/paginate'

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
