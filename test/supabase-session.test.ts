import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ensureSession, resetSessionState } from '@/lib/supabase/session'

type SignIn = () => Promise<{ error: Error | null }>

function client(session: unknown, signIn: SignIn = async () => ({ error: null })) {
  return {
    auth: {
      getSession: vi.fn(async () => ({ data: { session } })),
      signInAnonymously: signIn,
    },
  } as unknown as SupabaseClient
}

beforeEach(() => resetSessionState())

describe('ensureSession', () => {
  it('leaves an existing session alone', async () => {
    const signIn = vi.fn(async () => ({ error: null }))
    await ensureSession(client({ user: { id: 'u1' } }, signIn))
    expect(signIn).not.toHaveBeenCalled()
  })

  it('creates the account when there is none yet', async () => {
    const signIn = vi.fn(async () => ({ error: null }))
    await ensureSession(client(null, signIn))
    expect(signIn).toHaveBeenCalledTimes(1)
  })

  it('starts one sign-in for a burst of writes, not one per write', async () => {
    // Importing a CSV calls the write path repeatedly; each sign-in would be a
    // separate user, and Supabase rate-limits them besides.
    let release!: (v: { error: null }) => void
    const inFlight = new Promise<{ error: null }>((r) => { release = r })
    const signIn = vi.fn(() => inFlight)
    const c = client(null, signIn)
    const all = Promise.all([ensureSession(c), ensureSession(c), ensureSession(c)])
    release({ error: null })
    await all
    expect(signIn).toHaveBeenCalledTimes(1)
  })

  it('reports a failed sign-in instead of letting the write fail against RLS', async () => {
    const signIn = vi.fn(async () => ({ error: new Error('Request rate limit reached') }))
    await expect(ensureSession(client(null, signIn))).rejects.toThrow(/rate limit/)
  })

  it('lets a later write retry after a failed sign-in', async () => {
    const signIn = vi
      .fn<SignIn>()
      .mockResolvedValueOnce({ error: new Error('nổ') })
      .mockResolvedValueOnce({ error: null })
    const c = client(null, signIn)
    await expect(ensureSession(c)).rejects.toThrow('nổ')
    await expect(ensureSession(c)).resolves.toBeUndefined()
    expect(signIn).toHaveBeenCalledTimes(2)
  })
})
