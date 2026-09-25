import { describe, it, expect, vi, beforeEach } from 'vitest'

const { searchOneDirection, createContentClient } = vi.hoisted(() => ({
  searchOneDirection: vi.fn(async () => ({ entries: { en: [], es: [], zh: [] }, suggestions: [] })),
  createContentClient: vi.fn(() => ({})),
}))
vi.mock('@/lib/dictionary/search', () => ({ searchOneDirection }))
vi.mock('@/lib/supabase/content', () => ({ createContentClient }))
// The route's own caching is Next's, not the route's logic; unwrapping it is what makes
// the arguments reaching the data layer observable.
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))

import { GET } from '@/app/dictionary/search/route'

const get = (qs: string) => GET(new Request(`http://localhost/dictionary/search?${qs}`))
// searchOneDirection(client, q, direction, perLang, langs): [0] client, [1] q, [2]
// direction, [3] perLang, [4] langs.
const argsOf = (call: number) => searchOneDirection.mock.calls[call] as unknown as unknown[]

beforeEach(() => vi.clearAllMocks())

describe('GET /dictionary/search', () => {
  it('answers a blank query without touching the database', async () => {
    const res = await get('q=%20%20')
    expect(res.status).toBe(200)
    expect(searchOneDirection).not.toHaveBeenCalled()
  })

  it('asks for all three languages when none are named', async () => {
    await get('q=dog')
    expect(argsOf(0)[4]).toEqual(['en', 'es', 'zh'])
  })

  // `en,es` and `es,en` are the same request, and the list is part of the cache key.
  it('puts the requested languages in the canonical order', async () => {
    await get('q=dog&langs=zh,en')
    expect(argsOf(0)[4]).toEqual(['en', 'zh'])
  })

  it('falls back to all three when the parameter names nothing real', async () => {
    await get('q=dog&langs=fr,de')
    expect(argsOf(0)[4]).toEqual(['en', 'es', 'zh'])
  })

  // Which box the learner typed in, not a guess: "an", "ban" and "con" are real English
  // and Spanish headwords as well as Vietnamese ones. `unstable_cache` keys on the
  // arguments it wraps, so a different `direction` reaching searchOneDirection is a
  // different cache key: `dir=vi` and the default cannot answer from each other's entry.
  it('runs the direction the caller asks for, defaults to the foreign one, and keys the cache on it', async () => {
    await get('q=an&dir=vi')
    expect(argsOf(0)[2]).toBe('vi')

    await get('q=an')
    expect(argsOf(1)[2]).toBe('fw')
    expect(argsOf(1)[2]).not.toBe(argsOf(0)[2])

    await get('q=an&dir=fw')
    expect(argsOf(2)[2]).toBe('fw')
  })

  // The database cancelling on its own timeout is a temporary condition, and the answer
  // is to wait. A 500 reached the browser as an error page, and answering it as an empty
  // result set would tell the learner their word is in no language.
  it('answers a statement timeout with a 503 and a reason', async () => {
    searchOneDirection.mockRejectedValueOnce(Object.assign(new Error('canceling statement'), { code: '57014' }))
    const res = await get('q=%C4%83n')
    expect(res.status).toBe(503)
    expect(res.headers.get('Retry-After')).toBe('3')
    expect((await res.json()).error).toMatch(/đang khởi động/)
  })

  it('lets any other failure through', async () => {
    searchOneDirection.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: '42883' }))
    await expect(get('q=dog')).rejects.toThrow('boom')
  })

  it('cuts an over-long query in code points, not bytes', async () => {
    await get(`q=${encodeURIComponent('đ'.repeat(80))}`)
    expect(Array.from(argsOf(0)[1] as string)).toHaveLength(64)
  })

  it('tells the browser and the CDN different things about freshness', async () => {
    const res = await get('q=dog')
    expect(res.headers.get('Cache-Control')).toContain('must-revalidate')
    expect(res.headers.get('CDN-Cache-Control')).toContain('s-maxage=3600')
  })
})
