import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AccountLink } from '@/components/account/AccountLink'

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }),
}))

beforeEach(() => vi.clearAllMocks())

describe('AccountLink', () => {
  it('shows the address and the way to the account once signed in', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1', email: 'a@b.com' } } } })
    render(<AccountLink />)
    const link = await screen.findByRole('link', { name: 'a@b.com' })
    expect(link).toHaveAttribute('href', '/account')
  })

  // The notebook needs an account, so a visitor without one sees the ordinary
  // pair of doors: sign in, sign up.
  it('offers sign-in and sign-up when there is no session', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    render(<AccountLink />)
    expect(await screen.findByRole('link', { name: /Đăng nhập/i })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: /Đăng ký/i })).toHaveAttribute('href', '/register')
  })

  // A legacy anonymous session is not signed in: it still gets the public
  // header. Its words are protected at the notebook gate, not from here.
  it('shows the same doors for a legacy anonymous session', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    render(<AccountLink />)
    expect(await screen.findByRole('link', { name: /Đăng nhập/i })).toHaveAttribute('href', '/login')
  })

  // The signed-out corner reserves its width, hidden, from first paint so the nav
  // row (brand uses mr-auto) does not shift once the session resolves. jsdom
  // applies no stylesheet, so the class is what this test can check.
  it('reserves its width, hidden, until it knows which account this is', () => {
    getSession.mockReturnValue(new Promise(() => {}))
    const { container } = render(<AccountLink />)
    const corner = container.firstElementChild
    expect(corner).toHaveClass('invisible')
    expect(corner).toHaveAttribute('aria-hidden', 'true')
    expect(corner?.querySelectorAll('a')).toHaveLength(2)
  })
})
