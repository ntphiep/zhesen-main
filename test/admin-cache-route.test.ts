import { describe, it, expect, vi, beforeEach } from 'vitest'

const { revalidateTag, adminUser } = vi.hoisted(() => ({ revalidateTag: vi.fn(), adminUser: vi.fn() }))
vi.mock('next/cache', () => ({ revalidateTag }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/auth/admin', () => ({ adminUser }))

import { POST } from '@/app/api/admin/cache/route'

beforeEach(() => {
  revalidateTag.mockClear()
  adminUser.mockReset()
})

describe('POST /api/admin/cache', () => {
  it('answers 404 to anyone who is not an admin, and flushes nothing', async () => {
    adminUser.mockResolvedValue(null)
    const res = await POST()
    expect(res.status).toBe(404)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  // The admin reloads the page right after pressing the button, so that request must
  // not be served the stale copy 'max' would hand it.
  it('expires the lex tag immediately for an admin', async () => {
    adminUser.mockResolvedValue({ id: 'u-admin' })
    const res = await POST()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ revalidated: ['lex'] })
    expect(revalidateTag).toHaveBeenCalledWith('lex', { expire: 0 })
  })
})
