import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AccountLink } from '@/components/account/AccountLink'

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }),
}))

beforeEach(() => vi.clearAllMocks())

describe('AccountLink', () => {
  it('shows the address and the way to the account once signed in', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } } })
    render(<AccountLink />)
    const link = await screen.findByRole('link', { name: 'a@b.com' })
    expect(link).toHaveAttribute('href', '/account')
  })

  // An anonymous session is holding words nobody else can reach. "Đăng nhập"
  // here would invite the one action that abandons them.
  it('points an anonymous session at registration, not at sign-in', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    render(<AccountLink />)
    const link = await screen.findByRole('link', { name: /Lưu sổ tay/i })
    expect(link).toHaveAttribute('href', '/register')
  })

  it('offers sign-in when there is no session at all', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    render(<AccountLink />)
    const link = await screen.findByRole('link', { name: /Đăng nhập/i })
    expect(link).toHaveAttribute('href', '/login')
  })

  // Rendering a guess and correcting it a frame later moves the header under a
  // reader who may already be aiming at it.
  it('renders nothing until it knows which account this is', () => {
    getUser.mockReturnValue(new Promise(() => {}))
    const { container } = render(<AccountLink />)
    expect(container).toBeEmptyDOMElement()
  })
})
