import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser } }) }))

import { GET, POST, resetAiBudgets } from '@/app/api/ai/route'

const ENV = ['AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL'] as const
const saved: Record<string, string | undefined> = {}

const asNobody = () => getUser.mockResolvedValue({ data: { user: null } })
const asAnonymous = () => getUser.mockResolvedValue({ data: { user: { id: 'anon-1', is_anonymous: true } } })
const asPermanent = () => getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'learner@example.com' } } })

const post = () => POST(new Request('http://localhost/api/ai', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ task: 'enrich', input: { lang: 'en', headword: 'dog' } }),
}))

describe('the assistant is for a permanent account only', () => {
  const realFetch = globalThis.fetch

  beforeEach(() => {
    resetAiBudgets()
    getUser.mockReset()
    for (const k of ENV) saved[k] = process.env[k]
    process.env.AI_BASE_URL = 'http://router.test/v1'
    process.env.AI_API_KEY = 'sk-test'
  })
  afterEach(() => {
    for (const k of ENV) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
    globalThis.fetch = realFetch
  })

  it('answers enabled only to a permanent account on a configured deployment', async () => {
    asNobody()
    await expect((await GET()).json()).resolves.toEqual({ enabled: false })
    asAnonymous()
    await expect((await GET()).json()).resolves.toEqual({ enabled: false })
    asPermanent()
    await expect((await GET()).json()).resolves.toEqual({ enabled: true })
  })

  it('keeps the answer out of every shared cache', async () => {
    asPermanent()
    expect((await GET()).headers.get('cache-control')).toBe('private, no-store')
  })

  it('refuses a call without a permanent account before it reaches the model', async () => {
    const f = vi.fn()
    globalThis.fetch = f
    asNobody()
    expect((await post()).status).toBe(401)
    asAnonymous()
    expect((await post()).status).toBe(401)
    expect(f).not.toHaveBeenCalled()
  })
})
