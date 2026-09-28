import { describe, it, expect, vi } from 'vitest'
import { getLevelsForLanguage, getEntriesByLevel, getAllEntriesByLevel, isLevel } from '@/lib/dictionary/levels'
import { clientReturning } from './helpers/supabase'

function previewRow(headword: string) {
  return {
    id: `en:${headword}`, lang: 'en', headword, traditional: null, level: 'A1', frequency_rank: 1,
    attributes: {}, senses: [], pronunciations: [],
  }
}

describe('getLevelsForLanguage', () => {
  it('maps the count_entries_by_level RPC row to LevelSummary[]', async () => {
    const rpc = vi.fn(() => Promise.resolve({
      data: [{ level: 'A1', level_is_estimated: false, cnt: 2302 }, { level: 'A2', level_is_estimated: false, cnt: 1200 }],
      error: null,
    }))
    const client = { schema: vi.fn(() => ({ rpc })) } as unknown as import('@supabase/supabase-js').SupabaseClient
    const res = await getLevelsForLanguage(client, 'en')
    expect(rpc).toHaveBeenCalledWith('count_entries_by_level', { p_lang: 'en' })
    expect(res).toEqual([
      { level: 'A1', count: 2302, levelIsEstimated: false },
      { level: 'A2', count: 1200, levelIsEstimated: false },
    ])
  })

  // postgrest-js answers an empty 2xx body, and an empty-bodied 404, with
  // `data: null, error: null`. Returned as an empty list, `unstable_cache` keeps it.
  it('throws on an answer with no rows instead of returning an empty list', async () => {
    for (const data of [null, []]) {
      const rpc = vi.fn(() => Promise.resolve({ data, error: null }))
      const client = { schema: vi.fn(() => ({ rpc })) } as unknown as import('@supabase/supabase-js').SupabaseClient
      await expect(getLevelsForLanguage(client, 'en')).rejects.toThrow()
    }
  })
})

describe('isLevel', () => {
  it('knows every level each language uses, and nothing else', () => {
    expect(isLevel('en', 'A1')).toBe(true)
    expect(isLevel('es', 'C2')).toBe(true)
    expect(isLevel('zh', 'HSK7-9')).toBe(true)
    expect(isLevel('en', 'a1')).toBe(false)
    expect(isLevel('en', 'HSK1')).toBe(false)
    expect(isLevel('zh', 'A1')).toBe(false)
    expect(isLevel('en', 'zzz')).toBe(false)
  })
})

// Chainable mock for `.from('entries').select(sel, opts).eq().eq().order().range(from, to)`,
// where the terminal `.range()` call resolves with a page carved out of `allRows` and the
// true `count`, mirroring how PostgREST reports the total even when a request's data is
// capped by the server's max-rows setting.
function mockEntriesClient(allRows: ReturnType<typeof previewRow>[]) {
  const range = vi.fn((from: number, to: number) =>
    Promise.resolve({ data: allRows.slice(from, to + 1), error: null, count: allRows.length }))
  return { client: clientReturning(null, null, { range }).client, range }
}

describe('getEntriesByLevel', () => {
  it('returns the requested page and the true total', async () => {
    const { client, range } = mockEntriesClient([previewRow('a'), previewRow('b'), previewRow('c')])
    const page = await getEntriesByLevel(client, 'en', 'A1', 0, 2)
    expect(range).toHaveBeenCalledWith(0, 1)
    expect(page.items.map((e) => e.headword)).toEqual(['a', 'b'])
    expect(page.total).toBe(3)
  })

  it('leaves out the inflected forms, which the word page levels but the list does not', async () => {
    const is = vi.fn()
    const built = clientReturning([], null, {
      is: (...args: unknown[]) => { is(...args); return built.builder },
      range: () => Promise.resolve({ data: [], error: null, count: 0 }),
    })
    await getEntriesByLevel(built.client, 'en', 'A1', 0, 40)
    expect(is).toHaveBeenCalledWith('form_of', null)
  })

  it('caps the requested page size at the server max-rows limit', async () => {
    const { client, range } = mockEntriesClient([])
    await getEntriesByLevel(client, 'en', 'A1', 0, 5000)
    expect(range).toHaveBeenCalledWith(0, 999) // 1000-row page, i.e. offset 0..999
  })
})

describe('getAllEntriesByLevel', () => {
  it('pages through in chunks until a short page signals the end', async () => {
    // 1000 rows in the first chunk (exactly a full page) forces a second request.
    const rows = Array.from({ length: 1200 }, (_, i) => previewRow(`w${i}`))
    const { client, range } = mockEntriesClient(rows)
    const all = await getAllEntriesByLevel(client, 'en', 'A1')
    expect(all).toHaveLength(1200)
    expect(range).toHaveBeenCalledTimes(2)
    expect(range).toHaveBeenNthCalledWith(1, 0, 999)
    expect(range).toHaveBeenNthCalledWith(2, 1000, 1999)
  })

  it('stops after one request when the level is smaller than a chunk', async () => {
    const { client, range } = mockEntriesClient([previewRow('a'), previewRow('b')])
    const all = await getAllEntriesByLevel(client, 'en', 'A1')
    expect(all).toHaveLength(2)
    expect(range).toHaveBeenCalledTimes(1)
  })
})
