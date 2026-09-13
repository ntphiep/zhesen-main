import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { accountKind, attachEmail, signInByEmail } from '@/lib/auth/account'
import { safeNext } from '@/app/auth/callback/route'

const asUser = (over: Partial<User>) => ({ id: 'u1', ...over }) as User

function fakeAuth() {
  const updateUser = vi.fn(async () => ({ error: null }))
  const signInWithOtp = vi.fn(async () => ({ error: null }))
  return { client: { auth: { updateUser, signInWithOtp } } as unknown as SupabaseClient, updateUser, signInWithOtp }
}

beforeEach(() => {
  vi.stubGlobal('window', { location: { origin: 'https://zhesen.test' } })
})

describe('accountKind', () => {
  it('distinguishes no session, an anonymous one, and a permanent one', () => {
    expect(accountKind(null)).toBe('none')
    expect(accountKind(asUser({ email: undefined }))).toBe('anonymous')
    expect(accountKind(asUser({ email: 'a@b.com' }))).toBe('permanent')
  })
})

describe('attachEmail', () => {
  // Keeping the user id is the whole point: the wordlist, the FSRS schedule and
  // the streak all hang off it, so nothing has to be copied and nothing can be
  // lost in the copying.
  it('updates the current user rather than signing in as someone else', async () => {
    const { client, updateUser, signInWithOtp } = fakeAuth()
    await expect(attachEmail(client, 'a@b.com')).resolves.toEqual({ status: 'sent' })
    expect(updateUser).toHaveBeenCalledWith(
      { email: 'a@b.com' },
      { emailRedirectTo: 'https://zhesen.test/auth/callback?next=/wordlist' },
    )
    expect(signInWithOtp).not.toHaveBeenCalled()
  })

  it('reports the message Supabase itself gave when it refuses', async () => {
    const { client, updateUser } = fakeAuth()
    updateUser.mockResolvedValue({ error: { message: 'Email rate limit exceeded' } } as never)
    await expect(attachEmail(client, 'a@b.com'))
      .resolves.toEqual({ status: 'error', message: 'Email rate limit exceeded' })
  })
})

describe('signInByEmail', () => {
  it('signs in when the browser holds no words', async () => {
    const { client, signInWithOtp } = fakeAuth()
    await expect(signInByEmail(client, 'a@b.com', 0)).resolves.toEqual({ status: 'sent' })
    expect(signInWithOtp).toHaveBeenCalled()
  })

  // Signing in swaps the account underneath the session; any word saved against
  // the anonymous one would be stranded exactly the way 407 words already were.
  it('refuses when the browser holds words, rather than stranding them', async () => {
    const { client, signInWithOtp } = fakeAuth()
    const outcome = await signInByEmail(client, 'a@b.com', 12)
    expect(outcome.status).toBe('error')
    expect(signInWithOtp).not.toHaveBeenCalled()
  })
})

describe('safeNext', () => {
  const here = 'https://zhesen.app'
  const lands = (raw: string | null) => new URL(safeNext(raw, here), here).origin

  it('keeps a path on this site, query included', () => {
    expect(safeNext('/practice?mode=quiz', here)).toBe('/practice?mode=quiz')
  })
  it('falls back for a missing value', () => {
    expect(safeNext(null, here)).toBe('/wordlist')
  })

  // The value arrives in a URL anyone can hand the user. Checking the resolved
  // origin rather than a list of forbidden prefixes is the point: the first
  // version rejected '//evil.test' and let the backslash form through, because
  // WHATWG URL reads a backslash as a slash in an http(s) URL.
  const BACKSLASH = String.fromCharCode(92)

  it('sends the browser nowhere but this origin, whatever the input', () => {
    for (const hostile of [
      'https://evil.test/steal',
      '//evil.test/steal',
      '/' + BACKSLASH + 'evil.test/steal',
      '/' + BACKSLASH + BACKSLASH + 'evil.test',
      BACKSLASH + BACKSLASH + 'evil.test',
    ]) {
      expect(lands(hostile)).toBe(here)
    }
  })

  it('does not silently keep a hostile path either', () => {
    expect(safeNext('/' + BACKSLASH + 'evil.test/steal', here)).toBe('/wordlist')
  })
})
