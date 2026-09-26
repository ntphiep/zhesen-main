import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ensureSession, NoSessionError } from '@/lib/supabase/session'
import { authStub } from './helpers/supabase'

const signIn = () => vi.fn(async () => ({ error: null }))
const client = (session: unknown, signInAnonymously: () => Promise<{ error: null }>) =>
  authStub(session, signInAnonymously) as unknown as SupabaseClient

describe('ensureSession', () => {
  it('leaves an existing session alone', async () => {
    const signInAnonymously = signIn()
    await expect(ensureSession(client({ user: { id: 'u1' } }, signInAnonymously))).resolves.toBeUndefined()
    expect(signInAnonymously).not.toHaveBeenCalled()
  })

  // An anonymous account lives in one browser's cookie; minting one on a write is how
  // saved words ended up in an account nobody could get back into.
  it('refuses a write with no session instead of creating an anonymous account', async () => {
    const signInAnonymously = signIn()
    await expect(ensureSession(client(null, signInAnonymously))).rejects.toBeInstanceOf(NoSessionError)
    expect(signInAnonymously).not.toHaveBeenCalled()
  })

  // The words of an anonymous account made before this rule stay writable until
  // attachEmail turns it into a permanent one.
  it('lets an anonymous session that already exists keep writing', async () => {
    const signInAnonymously = signIn()
    const anonymous = { user: { id: 'u2', is_anonymous: true } }
    await expect(ensureSession(client(anonymous, signInAnonymously))).resolves.toBeUndefined()
    expect(signInAnonymously).not.toHaveBeenCalled()
  })
})
