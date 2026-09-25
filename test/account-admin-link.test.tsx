import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AccountLink } from '@/components/account/AccountLink'
import { AdminEntry } from '@/components/account/AdminEntry'

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
  rpc.mockResolvedValue({ data: true, error: null })
})

describe('the site header', () => {
  it('carries no way to /admin, even for an admin, and does not ask', async () => {
    render(<AccountLink />)
    await screen.findByRole('link', { name: 'a@b.com' })
    expect(screen.queryByRole('link', { name: /Quản trị/ })).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('AdminEntry', () => {
  it('links to the console', () => {
    render(<AdminEntry />)
    expect(screen.getByRole('link', { name: 'Mở trang quản trị' })).toHaveAttribute('href', '/admin')
  })
})
