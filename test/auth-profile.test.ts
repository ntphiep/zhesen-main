import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getProfile, setDisplayName } from '@/lib/auth/profile'
import { clientReturning, queryBuilder } from './helpers/supabase'

const row = { id: 'u1', role: 'learner', display_name: 'Hiệp' }

describe('getProfile', () => {
  it('asks for one account by id rather than relying on RLS to narrow it', async () => {
    const eq = vi.fn()
    const { client, builder } = clientReturning(row)
    // Keep the chain intact: record the arguments, then hand the builder back.
    Object.assign(builder, { eq: eq.mockImplementation(() => builder) })

    await getProfile(client, 'u1')

    expect(eq).toHaveBeenCalledWith('id', 'u1')
  })

  it('maps the row to camelCase', async () => {
    const { client } = clientReturning(row)
    await expect(getProfile(client, 'u1')).resolves.toEqual({
      id: 'u1', role: 'learner', displayName: 'Hiệp',
    })
  })

  it('reads a missing row as no profile, not as a failure', async () => {
    const { client } = clientReturning(null)
    await expect(getProfile(client, 'u1')).resolves.toBeNull()
  })

  it('reads a failed query as no profile', async () => {
    const { client } = clientReturning(null, { message: 'boom' })
    await expect(getProfile(client, 'u1')).resolves.toBeNull()
  })
})

describe('setDisplayName', () => {
  function client(user: { id: string } | null, error: unknown = null) {
    const builder = queryBuilder({ data: null, error })
    builder.update = vi.fn(() => builder)
    return {
      auth: { getUser: vi.fn(async () => ({ data: { user } })) },
      from: vi.fn(() => builder),
    } as unknown as SupabaseClient
  }

  it('says the session is gone in the words the sign-in forms use', async () => {
    await expect(setDisplayName(client(null), 'Hiệp')).resolves
      .toEqual({ ok: false, message: 'Phiên đăng nhập đã hết. Đăng nhập lại.' })
  })

  it('shows Vietnamese, never the database text, when the save fails', async () => {
    await expect(setDisplayName(client({ id: 'u1' }, { message: 'new row violates row-level security policy' }), 'Hiệp'))
      .resolves.toEqual({ ok: false, message: 'Chưa lưu được tên. Thử lại.' })
  })
})
