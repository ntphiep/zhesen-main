import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccountSettings } from '@/components/account/AccountSettings'
import { setPassword, signOut } from '@/lib/auth/account'
import { setDisplayName, type Profile } from '@/lib/auth/profile'

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/auth/account', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/account')>()),
  setPassword: vi.fn(async () => ({ status: 'active' as const })),
  signOut: vi.fn(async () => {}),
}))
vi.mock('@/lib/auth/profile', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/profile')>()),
  setDisplayName: vi.fn(async () => ({ ok: true as const })),
}))

const learner: Profile = { id: 'u1', role: 'learner', displayName: null }

beforeEach(() => vi.clearAllMocks())

describe('AccountSettings', () => {
  it('shows the address and a way out', async () => {
    render(<AccountSettings email="a@b.com" profile={learner} />)
    expect(screen.getByText('a@b.com')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }))
    expect(signOut).toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/')
  })

  // RLS refuses an update that changes the role, so a control here would be a
  // button that always fails. The role is granted from the database on purpose.
  it('shows the role and offers no way to change it', () => {
    render(<AccountSettings email="a@b.com" profile={{ ...learner, role: 'admin' }} />)
    expect(screen.getByText('Quản trị')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Vai trò|Quyền/i)).toBeNull()
  })

  it('treats a missing profile as an ordinary learner rather than breaking', () => {
    render(<AccountSettings email="a@b.com" profile={null} />)
    expect(screen.getByText('Người học')).toBeInTheDocument()
  })

  it('saves the display name', async () => {
    render(<AccountSettings email="a@b.com" profile={learner} />)
    await userEvent.type(screen.getByLabelText('Tên hiển thị'), 'Hiệp')
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(setDisplayName).toHaveBeenCalledWith(expect.anything(), 'Hiệp')
  })

  // This box is also the second half of the anonymous upgrade: a learner who
  // attached an email arrives here with a confirmed address and no password.
  it('sets a password and clears the box afterwards', async () => {
    render(<AccountSettings email="a@b.com" profile={learner} />)
    const box = screen.getByLabelText('Mật khẩu mới')
    await userEvent.type(box, 'longenough1')
    await userEvent.click(screen.getByRole('button', { name: 'Đặt mật khẩu' }))

    expect(setPassword).toHaveBeenCalledWith(expect.anything(), 'longenough1')
    expect(await screen.findByText(/Đã đặt mật khẩu mới/)).toBeInTheDocument()
    expect(box).toHaveValue('')
  })

  it('shows why the password was refused instead of pretending it worked', async () => {
    vi.mocked(setPassword).mockResolvedValue({ status: 'error', message: 'New password should be different' })
    render(<AccountSettings email="a@b.com" profile={learner} />)
    await userEvent.type(screen.getByLabelText('Mật khẩu mới'), 'longenough1')
    await userEvent.click(screen.getByRole('button', { name: 'Đặt mật khẩu' }))
    expect(await screen.findByText('New password should be different')).toBeInTheDocument()
  })
})
