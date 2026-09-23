import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AccountLink } from '@/components/account/AccountLink'

const { getSession, rpc } = vi.hoisted(() => ({ getSession: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    rpc,
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  getSession.mockResolvedValue({ data: { session: { user: { id: 'u1', email: 'a@b.com' } } } })
})

describe('AccountLink, admin link', () => {
  it('shows the way to /admin, unprefetched, when the profile is an admin', async () => {
    rpc.mockResolvedValue({ data: true, error: null })
    render(<AccountLink />)
    const link = await screen.findByRole('link', { name: 'Quản trị' })
    expect(link).toHaveAttribute('href', '/admin')
    expect(rpc).toHaveBeenCalledWith('is_admin')
  })

  it('shows nothing extra to a learner', async () => {
    rpc.mockResolvedValue({ data: false, error: null })
    render(<AccountLink />)
    await screen.findByRole('link', { name: 'a@b.com' })
    await vi.waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(screen.queryByRole('link', { name: 'Quản trị' })).toBeNull()
  })

  it('shows nothing when the check fails', async () => {
    rpc.mockRejectedValue(new Error('offline'))
    render(<AccountLink />)
    await screen.findByRole('link', { name: 'a@b.com' })
    await vi.waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(screen.queryByRole('link', { name: 'Quản trị' })).toBeNull()
  })

  it('does not ask for a visitor without an account', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    render(<AccountLink />)
    await screen.findByRole('link', { name: /Đăng nhập/i })
    expect(rpc).not.toHaveBeenCalled()
  })
})
