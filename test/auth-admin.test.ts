import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { queryBuilder } from './helpers/supabase'

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`) },
}))

import { adminUser, requireAdmin } from '@/lib/auth/admin'

const ADMIN = { id: 'u-admin', email: 'owner@example.com' }
const LEARNER = { id: 'u-learner', email: 'learner@example.com' }
const ANON = { id: 'u-anon' }

/** A client whose session is `user` and whose profiles query answers `profile`. */
function client(user: object | null, profile: unknown, error: unknown = null) {
  const from = vi.fn(() => queryBuilder({ data: profile, error }))
  const supabase = {
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
    from,
  } as unknown as SupabaseClient
  return { supabase, from }
}

const row = (id: string, role: string) => ({ id, role, display_name: null })

describe('requireAdmin', () => {
  it('lets an admin profile through and hands back the user', async () => {
    const { supabase } = client(ADMIN, row(ADMIN.id, 'admin'))
    await expect(requireAdmin(supabase)).resolves.toMatchObject({ id: ADMIN.id })
  })

  it('answers a learner with the 404 page, not a redirect', async () => {
    const { supabase } = client(LEARNER, row(LEARNER.id, 'learner'))
    await expect(requireAdmin(supabase)).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('sends an anonymous session to /register, keeping its words', async () => {
    const { supabase, from } = client(ANON, null)
    await expect(requireAdmin(supabase)).rejects.toThrow('NEXT_REDIRECT /register?next=%2Fadmin')
    expect(from).not.toHaveBeenCalled()
  })

  it('sends a browser with no session to /login', async () => {
    const { supabase } = client(null, null)
    await expect(requireAdmin(supabase)).rejects.toThrow('NEXT_REDIRECT /login?next=%2Fadmin')
  })

  // `getProfile` returns null on a failed query. That must read as "not admin".
  it('treats a profile query that failed as not admin', async () => {
    const { supabase } = client(ADMIN, null, { message: 'network down' })
    await expect(requireAdmin(supabase)).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

describe('adminUser', () => {
  it('returns the user for an admin', async () => {
    const { supabase } = client(ADMIN, row(ADMIN.id, 'admin'))
    await expect(adminUser(supabase)).resolves.toMatchObject({ id: ADMIN.id })
  })

  it('returns null for a learner, an anonymous session and no session, without redirecting', async () => {
    await expect(adminUser(client(LEARNER, row(LEARNER.id, 'learner')).supabase)).resolves.toBeNull()
    await expect(adminUser(client(ANON, null).supabase)).resolves.toBeNull()
    await expect(adminUser(client(null, null).supabase)).resolves.toBeNull()
  })

  it('returns null when the profile cannot be read', async () => {
    const { supabase } = client(ADMIN, null, { message: 'network down' })
    await expect(adminUser(supabase)).resolves.toBeNull()
  })
})
