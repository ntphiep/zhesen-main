import { describe, it, expect, vi, beforeEach } from 'vitest'

const { searchOneDirection } = vi.hoisted(() => ({ searchOneDirection: vi.fn() }))
vi.mock('@/lib/dictionary/search', () => ({ searchOneDirection }))
vi.mock('@/lib/supabase/content', () => ({ createContentClient: () => ({}) }))
// Next's `unstable_cache` stores a result only once the function resolves: a rejection on a
// miss propagates and stores nothing (next/dist/server/web/spec-extension/unstable-cache.js).
vi.mock('next/cache', () => ({
  unstable_cache: <A extends unknown[], R>(fn: (...args: A) => Promise<R>) => {
    const store = new Map<string, R>()
    return async (...args: A) => {
      const key = JSON.stringify(args)
      if (store.has(key)) return store.get(key)
      const value = await fn(...args)
      store.set(key, value)
      return value
    }
  },
}))

import { getCachedSearch } from '@/lib/dictionary/cached'

const EMPTY = { en: [], es: [], zh: [] }

beforeEach(() => searchOneDirection.mockReset())

describe('getCachedSearch', () => {
  // "trường" without its machine-translation rows answered only resurrection pie and field
  // for the hour the degraded answer stayed cached.
  it('answers a lookup whose translation failed without keeping it', async () => {
    searchOneDirection.mockResolvedValue({ entries: EMPTY, suggestions: [], translationFailed: true })
    expect(await getCachedSearch('trường', ['en'], 'vi')).toMatchObject({ translationFailed: true })
    await getCachedSearch('trường', ['en'], 'vi')
    expect(searchOneDirection).toHaveBeenCalledTimes(2)
  })

  it('keeps a complete answer', async () => {
    searchOneDirection.mockResolvedValue({ entries: EMPTY, suggestions: [] })
    await getCachedSearch('ăn', ['en'], 'vi')
    await getCachedSearch('ăn', ['en'], 'vi')
    expect(searchOneDirection).toHaveBeenCalledTimes(1)
  })
})
