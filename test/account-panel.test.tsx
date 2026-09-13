import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccountPanel } from '@/components/account/AccountPanel'
import { attachEmail, signInByEmail } from '@/lib/auth/account'

const { getUser, signOut } = vi.hoisted(() => ({
  getUser: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser,
      signOut,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }),
}))
vi.mock('@/lib/auth/account', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/account')>()),
  attachEmail: vi.fn(async () => ({ status: 'sent' as const })),
  signInByEmail: vi.fn(async () => ({ status: 'sent' as const })),
}))

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

describe('AccountPanel', () => {
  it('warns about the words at stake when the account is anonymous', async () => {
    render(<AccountPanel wordCount={410} />)
    expect(await screen.findByText(/410 từ đang chỉ nằm trong trình duyệt này/)).toBeInTheDocument()
  })

  it('stays quiet when there is nothing yet to lose', async () => {
    render(<AccountPanel wordCount={0} />)
    expect(await screen.findByText(/gắn với trình duyệt này/)).toBeInTheDocument()
    expect(screen.queryByText(/Xóa dữ liệu duyệt web/)).toBeNull()
  })

  // A browser holding words must attach the email to the account it already has.
  // Signing in instead would swap accounts and leave those words behind.
  it('attaches the email to the current account when this browser holds the words', async () => {
    render(<AccountPanel wordCount={410} />)
    await userEvent.click(await screen.findByRole('button', { name: /Lưu bằng email/i }))
    await userEvent.type(screen.getByLabelText('Địa chỉ email'), 'a@b.com')
    await userEvent.click(screen.getByRole('button', { name: /Gửi liên kết/i }))

    expect(attachEmail).toHaveBeenCalledWith(expect.anything(), 'a@b.com')
    expect(signInByEmail).not.toHaveBeenCalled()
    expect(await screen.findByText(/Đã gửi liên kết xác nhận tới a@b.com/)).toBeInTheDocument()
  })

  it('signs in instead when this browser holds nothing', async () => {
    render(<AccountPanel wordCount={0} />)
    await userEvent.click(await screen.findByRole('button', { name: /Đăng nhập bằng email/i }))
    await userEvent.type(screen.getByLabelText('Địa chỉ email'), 'a@b.com')
    await userEvent.click(screen.getByRole('button', { name: /Gửi liên kết/i }))

    expect(signInByEmail).toHaveBeenCalledWith(expect.anything(), 'a@b.com', 0)
    expect(attachEmail).not.toHaveBeenCalled()
  })

  it('shows the address and a way out once the account is permanent', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } } })
    render(<AccountPanel wordCount={410} />)
    expect(await screen.findByText('a@b.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument()
    expect(screen.queryByText(/chỉ nằm trong trình duyệt/)).toBeNull()
  })

  it('shows why sending failed instead of pretending it worked', async () => {
    vi.mocked(attachEmail).mockResolvedValue({ status: 'error', message: 'Email rate limit exceeded' })
    render(<AccountPanel wordCount={5} />)
    await userEvent.click(await screen.findByRole('button', { name: /Lưu bằng email/i }))
    await userEvent.type(screen.getByLabelText('Địa chỉ email'), 'a@b.com')
    await userEvent.click(screen.getByRole('button', { name: /Gửi liên kết/i }))
    expect(await screen.findByText('Email rate limit exceeded')).toBeInTheDocument()
  })
})
