import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { getUser, rpc } = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser }, rpc }) }))

import { POST, resetAiBudgets } from '@/app/api/ai/route'

const ENV = ['AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL', 'AI_FALLBACK_BASE_URL', 'AI_FALLBACK_API_KEY'] as const
const saved: Record<string, string | undefined> = {}

const enrich = () => POST(new Request('http://localhost/api/ai', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ task: 'enrich', input: { lang: 'en', headword: 'dog' } }),
}))

const answer = JSON.stringify({ meaningVi: 'con chó', ipa: 'dɔɡ', pos: 'noun', level: 'A1', example: 'The dog barked.', exampleVi: 'Con chó sủa.' })

describe('the daily cap on assistant calls', () => {
  const realFetch = globalThis.fetch

  beforeEach(() => {
    resetAiBudgets()
    getUser.mockReset().mockResolvedValue({ data: { user: { id: 'u1', email: 'learner@example.com' } } })
    rpc.mockReset()
    for (const k of ENV) saved[k] = process.env[k]
    for (const k of ENV) delete process.env[k]
    process.env.AI_BASE_URL = 'http://router.test/v1'
    process.env.AI_API_KEY = 'sk-test'
    globalThis.fetch = vi.fn(async () => Response.json({ choices: [{ message: { content: answer } }] })) as unknown as typeof fetch
  })
  afterEach(() => {
    for (const k of ENV) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
    globalThis.fetch = realFetch
    vi.restoreAllMocks()
  })

  it('takes one call off the allowance before asking the model', async () => {
    rpc.mockResolvedValue({ data: true, error: null })
    expect((await enrich()).status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('ai_take_call')
    expect(globalThis.fetch).toHaveBeenCalledOnce()
  })

  it('refuses without asking the model once the allowance is spent', async () => {
    rpc.mockResolvedValue({ data: false, error: null })
    const res = await enrich()
    expect(res.status).toBe(429)
    await expect(res.json()).resolves.toEqual({ error: 'Hết lượt hỏi AI hôm nay. Thử lại vào ngày mai.' })
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  // Before 0180 is applied, or with the database briefly away, the minute budgets still hold.
  it('lets the call through and logs it when the check itself fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    rpc.mockResolvedValue({ data: null, error: { message: 'Could not find the function public.ai_take_call' } })
    expect((await enrich()).status).toBe(200)
    expect(log).toHaveBeenCalledWith('ai cap check failed', expect.stringContaining('ai_take_call'))
  })

  it('spends nothing on input it refuses', async () => {
    const res = await POST(new Request('http://localhost/api/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'enrich', input: { lang: 'fr', headword: 'chien' } }),
    }))
    expect(res.status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })
})
