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

  // The notebook needs an account, so a visitor without one sees the ordinary
  // pair of doors: sign in, sign up.
  it('offers sign-in and sign-up when there is no session', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    render(<AccountLink />)
    expect(await screen.findByRole('link', { name: /Đăng nhập/i })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: /Đăng ký/i })).toHaveAttribute('href', '/register')
  })

  // A legacy anonymous session is not signed in: it still gets the public
  // header. Its words are protected at the notebook gate, not from here.
  it('shows the same doors for a legacy anonymous session', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    render(<AccountLink />)
    expect(await screen.findByRole('link', { name: /Đăng nhập/i })).toHaveAttribute('href', '/login')
  })

  // The corner used to render nothing until the session answered. The brand holds
  // mr-auto, so the whole nav row slid left the moment it appeared. It now lays the
  // signed-out pair out from the first paint and hides it: same width, no motion.
  // jsdom applies no stylesheet, so the class is what can be checked here.
  it('reserves its width, hidden, until it knows which account this is', () => {
    getUser.mockReturnValue(new Promise(() => {}))
    const { container } = render(<AccountLink />)
    const corner = container.firstElementChild
    expect(corner).toHaveClass('invisible')
    expect(corner).toHaveAttribute('aria-hidden', 'true')
    expect(corner?.querySelectorAll('a')).toHaveLength(2)
  })
})
