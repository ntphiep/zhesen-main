import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { rpc, permanentUser } = vi.hoisted(() => ({ rpc: vi.fn(), permanentUser: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))
vi.mock('@/lib/auth/guard', () => ({ permanentUser }))
vi.mock('next/server', () => ({ after: (fn: () => unknown) => { void fn() } }))
const { aiCacheSecret } = vi.hoisted(() => ({ aiCacheSecret: vi.fn() }))
vi.mock('@/lib/ai/cacheSecret', () => ({ aiCacheSecret }))

import { POST } from '@/app/dictionary/translate/route'
import { resetUsage } from '@/lib/translate/usage'

function post(text: string, to: string[] = ['en']) {
  return POST(new Request('http://localhost/dictionary/translate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, from: 'vi', to }),
  }))
}

function azure(metered: string) {
  return vi.fn(async () => new Response(
    JSON.stringify([{ translations: [{ text: 'hello', to: 'en' }] }]),
    { status: 200, headers: { 'X-metered-usage': metered } },
  ))
}

describe('POST /dictionary/translate budget', () => {
  const realFetch = globalThis.fetch
  const savedKey = process.env.AZURE_TRANSLATOR_KEY
  let n = 0
  const fresh = (len = 20) => `budget case ${++n} `.padEnd(len, 'x')

  beforeEach(() => {
    process.env.AZURE_TRANSLATOR_KEY = 'test-key'
    resetUsage()
    rpc.mockReset()
    rpc.mockResolvedValue({ data: 0, error: null })
    aiCacheSecret.mockReset().mockResolvedValue('s3cret')
    permanentUser.mockReset()
    permanentUser.mockResolvedValue(null)
  })
  afterEach(() => {
    globalThis.fetch = realFetch
    if (savedKey === undefined) delete process.env.AZURE_TRANSLATOR_KEY
    else process.env.AZURE_TRANSLATOR_KEY = savedKey
  })

  it('refuses a passage over 1,000 characters without an account, before Azure', async () => {
    const f = azure('1001')
    globalThis.fetch = f
    const res = await post(fresh(1001))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/1\.000 ký tự/)
    expect(f).not.toHaveBeenCalled()
  })

  it('translates the same passage for a signed-in account', async () => {
    permanentUser.mockResolvedValue({ id: 'u1' })
    globalThis.fetch = azure('1001')
    expect((await post(fresh(1001))).status).toBe(200)
  })

  it('refuses once the month has spent the budget, before Azure', async () => {
    rpc.mockResolvedValue({ data: 1_999_990, error: null })
    const f = azure('20')
    globalThis.fetch = f
    const res = await post(fresh(20))
    expect(res.status).toBe(429)
    expect((await res.json()).error).toMatch(/^Chưa dịch được/)
    expect(f).not.toHaveBeenCalled()
  })

  it('adds what Azure charged to the day', async () => {
    globalThis.fetch = azure('42')
    expect((await post(fresh(21))).status).toBe(200)
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledWith('translate_usage', { p_secret: 's3cret', p_chars: 42 }))
  })

  // The meter needs the server secret; without one it neither counts nor refuses.
  it('translates and counts nothing when no secret is configured', async () => {
    aiCacheSecret.mockResolvedValue(null)
    rpc.mockResolvedValue({ data: 1_999_990, error: null })
    globalThis.fetch = azure('20')
    expect((await post(fresh(20))).status).toBe(200)
    expect(rpc).not.toHaveBeenCalled()
  })

  // Azure's own quota still stands behind the counter, so an unreadable count must not
  // take the passage block down with it.
  it('still translates when the count cannot be read', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'function does not exist' } })
    globalThis.fetch = azure('20')
    expect((await post(fresh(20))).status).toBe(200)
  })
})
