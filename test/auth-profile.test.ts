import { describe, it, expect, vi } from 'vitest'
import { getProfile } from '@/lib/auth/profile'
import { clientReturning } from './helpers/supabase'

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
