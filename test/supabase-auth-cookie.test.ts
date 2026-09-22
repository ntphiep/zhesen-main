import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const ssr = vi.hoisted(() => ({
  createBrowserClient: vi.fn(() => ({})),
  createServerClient: vi.fn(() => ({ auth: { getSession: async () => ({}) } })),
}))
vi.mock('@supabase/ssr', () => ssr)
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }))

import { SUPABASE_AUTH_COOKIE } from '@/lib/supabase/env'
import { createClient as createBrowser } from '@/lib/supabase/client'
import { createClient as createServer } from '@/lib/supabase/server'
import { proxy } from '@/proxy'

const pinned = expect.objectContaining({
  cookieOptions: { name: SUPABASE_AUTH_COOKIE },
})

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.cloudfront.net'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
})

// @supabase/ssr derives the cookie name from the first label of the host
// (createServerClient.js:33, createBrowserClient.js:41 set storageKey from
// cookieOptions.name). Moving off *.supabase.co would rename the cookie and drop
// every session with it, anonymous accounts included.
describe('SUPABASE_AUTH_COOKIE', () => {
  it('still carries the Cloud project ref', () => {
    expect(SUPABASE_AUTH_COOKIE).toBe('sb-cvltsyoweddhpkomuevz-auth-token')
  })

  it('is pinned on the browser client', () => {
    createBrowser()
    expect(ssr.createBrowserClient).toHaveBeenCalledWith(expect.any(String), expect.any(String), pinned)
  })

  it('is pinned on the server client', async () => {
    await createServer()
    expect(ssr.createServerClient).toHaveBeenCalledWith(expect.any(String), expect.any(String), pinned)
  })

  it('is pinned in the proxy, which writes the rotated cookies back', async () => {
    await proxy(new NextRequest('https://zhesen-main.vercel.app/account'))
    expect(ssr.createServerClient).toHaveBeenCalledWith(expect.any(String), expect.any(String), pinned)
  })
})
