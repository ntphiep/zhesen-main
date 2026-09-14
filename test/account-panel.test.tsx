import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AccountPanel } from '@/components/account/AccountPanel'

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

/**
 * The panel used to carry the email form as well. That form now lives at
 * `/register` and `/login`, which handle all three doors; the tests for it moved
 * to test/auth-form.test.tsx rather than being dropped. What is left here is the
 * one decision this panel still makes: which door to point at.
 */
describe('AccountPanel', () => {
  it('warns about the words at stake when the account is anonymous', async () => {
    render(<AccountPanel wordCount={410} />)
    expect(await screen.findByText(/410 từ đang chỉ nằm trong trình duyệt này/)).toBeInTheDocument()
  })

  it('stays quiet when there is nothing yet to lose', async () => {
    render(<AccountPanel wordCount={0} />)
    expect(await screen.findByText(/gắn với trình duyệt này/)).toBeInTheDocument()
    expect(screen.queryByText(/Xoá dữ liệu duyệt web/)).toBeNull()
  })

  // Registration attaches the email to the account already holding the words.
  // Sending an anonymous learner to /login instead would invite the one action
  // that abandons them, which is how 407 words were lost.
  it('sends a browser that holds words to registration, never to sign-in', async () => {
    render(<AccountPanel wordCount={410} />)
    const link = await screen.findByRole('link', { name: /Lưu bằng email/i })
    expect(link).toHaveAttribute('href', '/register')
  })

  it('says nothing at all once the account is permanent', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } } })
    const { container } = render(<AccountPanel wordCount={410} />)
    // The panel renders null after the session resolves; wait for that resolution
    // by way of a re-render rather than asserting on the first frame.
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement())
  })
})
