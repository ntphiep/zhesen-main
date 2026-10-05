import { describe, it, expect, vi, afterEach } from 'vitest'
import { aiEnabled } from '@/lib/ai/browser'
import { SUPABASE_AUTH_COOKIE } from '@/lib/supabase/env'

const clearCookies = () => {
  for (const c of document.cookie.split(/;\s*/).filter(Boolean)) {
    document.cookie = `${c.split('=')[0]}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  }
}

describe('aiEnabled', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
    clearCookies()
  })

  // A visitor without a session can only be told false; GET /api/ai cost 0.26 to 0.28 s
  // per page view and is uncacheable.
  it('answers false without asking when the browser holds no session', async () => {
    const f = vi.fn()
    globalThis.fetch = f
    await expect(aiEnabled()).resolves.toBe(false)
    expect(f).not.toHaveBeenCalled()
  })

  it('asks the route when an auth cookie is present, whole or in chunks', async () => {
    const f = vi.fn(async () => Response.json({ enabled: true }))
    globalThis.fetch = f
    document.cookie = `${SUPABASE_AUTH_COOKIE}=base64-x; path=/`
    await expect(aiEnabled()).resolves.toBe(true)
    clearCookies()
    document.cookie = `${SUPABASE_AUTH_COOKIE}.0=base64-x; path=/`
    await expect(aiEnabled()).resolves.toBe(true)
    expect(f).toHaveBeenCalledTimes(2)
  })
})
