import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthForm } from '@/components/account/AuthForm'
import { attachEmail, registerWithPassword, signInWithPassword } from '@/lib/auth/account'

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/auth/account', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/account')>()),
  attachEmail: vi.fn(async () => ({ status: 'active' as const })),
  registerWithPassword: vi.fn(async () => ({ status: 'active' as const })),
  signInWithPassword: vi.fn(async () => ({ status: 'active' as const })),
}))

beforeEach(() => vi.clearAllMocks())

const type = (label: RegExp | string, value: string) =>
  userEvent.type(screen.getByLabelText(label), value)

describe('AuthForm, registering', () => {
  // The words hang off the anonymous account. Creating a second one would leave
  // them where nothing can reach them, which is the failure this whole module
  // exists to prevent, so the form attaches instead of signing up.
  it('attaches the email and password to the account already holding the words', async () => {
    render(<AuthForm mode="register" localWordCount={410} hasAnonymousSession />)
    await type('Email', 'a@b.com')
    await type('Mật khẩu', 'longenough1')
    await userEvent.click(screen.getByRole('button', { name: /Hoàn tất tài khoản/i }))

    expect(attachEmail).toHaveBeenCalledWith(expect.anything(), 'a@b.com', 'longenough1')
    expect(registerWithPassword).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/wordlist')
  })

  it('says how many words are at stake while upgrading', async () => {
    render(<AuthForm mode="register" localWordCount={410} hasAnonymousSession />)
    expect(screen.getByText(/410 từ/)).toBeInTheDocument()
  })

  it('creates a new account when the browser holds nothing', async () => {
    render(<AuthForm mode="register" localWordCount={0} hasAnonymousSession={false} />)
    await type('Email', 'a@b.com')
    await type('Mật khẩu', 'longenough1')
    await userEvent.click(screen.getByRole('button', { name: /Tạo tài khoản/i }))

    expect(registerWithPassword).toHaveBeenCalledWith(expect.anything(), 'a@b.com', 'longenough1')
    expect(attachEmail).not.toHaveBeenCalled()
  })

  // An anonymous session with no words saved is not holding anything, so there is
  // nothing to attach to and a real account is the right outcome.
  it('creates a new account for an empty anonymous session too', async () => {
    render(<AuthForm mode="register" localWordCount={0} hasAnonymousSession />)
    await type('Email', 'a@b.com')
    await type('Mật khẩu', 'longenough1')
    await userEvent.click(screen.getByRole('button', { name: /Tạo tài khoản/i }))

    expect(registerWithPassword).toHaveBeenCalled()
    expect(attachEmail).not.toHaveBeenCalled()
  })
})

describe('AuthForm, signing in', () => {
  it('passes the word count through so the guard can refuse', async () => {
    render(<AuthForm mode="login" localWordCount={12} hasAnonymousSession />)
    await type('Email', 'a@b.com')
    await type('Mật khẩu', 'longenough1')
    await userEvent.click(screen.getByRole('button', { name: /^Đăng nhập$/i }))

    expect(signInWithPassword).toHaveBeenCalledWith(expect.anything(), 'a@b.com', 'longenough1', 12)
  })

  it('offers no emailed link and no reset: nothing sends mail', async () => {
    render(<AuthForm mode="login" localWordCount={0} hasAnonymousSession={false} />)
    expect(screen.queryByRole('button', { name: /liên kết|Quên mật khẩu/i })).toBeNull()
  })

  it('goes on to the wordlist once the session is live', async () => {
    render(<AuthForm mode="login" localWordCount={0} hasAnonymousSession={false} />)
    await type('Email', 'a@b.com')
    await type('Mật khẩu', 'longenough1')
    await userEvent.click(screen.getByRole('button', { name: /^Đăng nhập$/i }))

    expect(push).toHaveBeenCalledWith('/wordlist')
  })

  it('shows why it failed instead of pretending it worked', async () => {
    vi.mocked(signInWithPassword).mockResolvedValue({ status: 'error', message: 'Invalid login credentials' })
    render(<AuthForm mode="login" localWordCount={0} hasAnonymousSession={false} />)
    await type('Email', 'a@b.com')
    await type('Mật khẩu', 'longenough1')
    await userEvent.click(screen.getByRole('button', { name: /^Đăng nhập$/i }))

    expect(await screen.findByText('Invalid login credentials')).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })
})

// #23: the browser's own validation bubble is English inside a Vietnamese page.
describe('AuthForm, sent incomplete', () => {
  it('asks for the email in Vietnamese when the form is empty', async () => {
    render(<AuthForm mode="login" localWordCount={0} hasAnonymousSession={false} />)
    await userEvent.click(screen.getByRole('button', { name: /^Đăng nhập$/i }))

    expect(await screen.findByText('Nhập email.')).toBeInTheDocument()
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('asks for the password in Vietnamese when only the email is filled', async () => {
    render(<AuthForm mode="register" localWordCount={0} hasAnonymousSession={false} />)
    await type('Email', 'a@b.com')
    await userEvent.click(screen.getByRole('button', { name: /Tạo tài khoản/i }))

    expect(await screen.findByText('Nhập mật khẩu.')).toBeInTheDocument()
    expect(registerWithPassword).not.toHaveBeenCalled()
  })
})
