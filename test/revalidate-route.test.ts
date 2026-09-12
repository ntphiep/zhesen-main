import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const revalidateTag = vi.hoisted(() => vi.fn())
vi.mock('next/cache', () => ({ revalidateTag }))

import { POST } from '@/app/api/revalidate/route'

const post = (headers: Record<string, string> = {}) =>
  POST(new Request('http://localhost/api/revalidate', { method: 'POST', headers }))

describe('POST /api/revalidate', () => {
  const original = process.env.REVALIDATE_SECRET

  beforeEach(() => {
    revalidateTag.mockClear()
    process.env.REVALIDATE_SECRET = 'test-secret'
  })
  afterEach(() => {
    if (original === undefined) delete process.env.REVALIDATE_SECRET
    else process.env.REVALIDATE_SECRET = original
  })

  it('refuses to run when no secret is configured', async () => {
    delete process.env.REVALIDATE_SECRET
    const res = await post({ 'x-revalidate-secret': 'anything' })
    expect(res.status).toBe(503)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('rejects a wrong secret', async () => {
    const res = await post({ 'x-revalidate-secret': 'wrong' })
    expect(res.status).toBe(401)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('rejects a missing header rather than treating it as empty', async () => {
    const res = await post()
    expect(res.status).toBe(401)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('clears the cache tag on the right secret', async () => {
    const res = await post({ 'x-revalidate-secret': 'test-secret' })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ revalidated: ['lex'] })
    expect(revalidateTag).toHaveBeenCalledWith('lex', 'max')
  })

  it('clears every tag the app actually caches under, and no more', async () => {
    // A tag listed here that nothing caches under is dead weight; a tag missing
    // from here leaves data stale after the pipeline loads new rows. `content`
    // was the former: it outlived the JSON seed files it belonged to.
    await post({ 'x-revalidate-secret': 'test-secret' })
    expect(revalidateTag.mock.calls.map(([tag]) => tag)).toEqual(['lex'])
  })
})
