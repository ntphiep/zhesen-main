import { describe, it, expect, vi, beforeEach } from 'vitest'

const { searchBothDirections, createContentClient } = vi.hoisted(() => ({
  searchBothDirections: vi.fn(async () => ({
    forward: { en: [], es: [], zh: [] }, reverse: { en: [], es: [], zh: [] }, suggestions: [],
  })),
  createContentClient: vi.fn(() => ({})),
}))
vi.mock('@/lib/dictionary/search', () => ({ searchBothDirections }))
vi.mock('@/lib/supabase/content', () => ({ createContentClient }))
// The route's own caching is Next's, not the route's logic; unwrapping it is what makes
// the arguments reaching the data layer observable.
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))

import { GET } from '@/app/dictionary/search/route'

const get = (qs: string) => GET(new Request(`http://localhost/dictionary/search?${qs}`))
const argsOf = (call: number) => searchBothDirections.mock.calls[call] as unknown as unknown[]

beforeEach(() => vi.clearAllMocks())

describe('GET /dictionary/search', () => {
  it('answers a blank query without touching the database', async () => {
    const res = await get('q=%20%20')
    expect(res.status).toBe(200)
    expect(searchBothDirections).not.toHaveBeenCalled()
  })

  it('asks for all three languages when none are named', async () => {
    await get('q=dog')
    expect(argsOf(0)[3]).toEqual(['en', 'es', 'zh'])
  })

  // `en,es` and `es,en` are the same request, and the list is part of the cache key.
  it('puts the requested languages in the canonical order', async () => {
    await get('q=dog&langs=zh,en')
    expect(argsOf(0)[3]).toEqual(['en', 'zh'])
  })

  it('falls back to all three when the parameter names nothing real', async () => {
    await get('q=dog&langs=fr,de')
    expect(argsOf(0)[3]).toEqual(['en', 'es', 'zh'])
  })

  // "an", "ban" and "con" are real English and Spanish headwords scoring above the
  // structural threshold, so the Vietnamese direction only runs when asked for.
  it('runs the Vietnamese direction when the caller asks for it', async () => {
    await get('q=an&vi=1')
    expect(argsOf(0)[4]).toBe(true)

    await get('q=an')
    expect(argsOf(1)[4]).toBe(false)
  })

  // The database cancelling on its own timeout is a temporary condition, and the answer
  // is to wait. A 500 reached the browser as an error page, and answering it as an empty
  // result set would tell the learner their word is in no language.
  it('answers a statement timeout with a 503 and a reason', async () => {
    searchBothDirections.mockRejectedValueOnce(Object.assign(new Error('canceling statement'), { code: '57014' }))
    const res = await get('q=%C4%83n')
    expect(res.status).toBe(503)
    expect(res.headers.get('Retry-After')).toBe('3')
    expect((await res.json()).error).toMatch(/khởi động chậm/)
  })

  it('lets any other failure through', async () => {
    searchBothDirections.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: '42883' }))
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
