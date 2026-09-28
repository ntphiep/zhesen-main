import { describe, it, expect, vi } from 'vitest'
import { AuthApiError, AuthSessionMissingError, type SupabaseClient, type User } from '@supabase/supabase-js'
import {
  accountKind, attachEmail, passwordProblem, registerWithPassword, setPassword,
  signInWithPassword, MIN_PASSWORD,
} from '@/lib/auth/account'
import { safeNext } from '@/lib/auth/redirect'

const asUser = (over: Partial<User>) => ({ id: 'u1', ...over }) as User

function fakeAuth() {
  const updateUser = vi.fn(async () => ({ error: null }))
  const signUp = vi.fn(async () => ({ data: { session: { access_token: 't' } }, error: null }))
  const signInWithPassword = vi.fn(async () => ({ error: null }))
  const auth = { updateUser, signUp, signInWithPassword }
  return { client: { auth } as unknown as SupabaseClient, updateUser, signUp, signInWithPassword }
}

describe('accountKind', () => {
  it('distinguishes no session, an anonymous one, and a permanent one', () => {
    expect(accountKind(null)).toBe('none')
    expect(accountKind(asUser({ email: undefined }))).toBe('anonymous')
    expect(accountKind(asUser({ email: 'a@b.com' }))).toBe('permanent')
  })
})

describe('attachEmail', () => {
  // Keeping the user id is the whole point: the wordlist, the FSRS schedule and
  // the streak all hang off it, so nothing has to be copied and nothing can be
  // lost in the copying.
  it('updates the current user rather than signing in as someone else', async () => {
    const { client, updateUser, signUp } = fakeAuth()
    await expect(attachEmail(client, 'a@b.com', 'longenough1')).resolves.toEqual({ status: 'active' })
    // Email and password in one call: GoTrue confirms the address at once, and an
    // anonymous user may set a password in the same request as its email.
    expect(updateUser).toHaveBeenCalledWith({ email: 'a@b.com', password: 'longenough1' })
    expect(signUp).not.toHaveBeenCalled()
  })

  it('does not send a too-short password to Supabase at all', async () => {
    const { client, updateUser } = fakeAuth()
    const outcome = await attachEmail(client, 'a@b.com', 'short')
    expect(outcome.status).toBe('error')
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('reports the message Supabase itself gave when it refuses', async () => {
    const { client, updateUser } = fakeAuth()
    updateUser.mockResolvedValue({ error: { message: 'Email rate limit exceeded' } } as never)
    await expect(attachEmail(client, 'a@b.com', 'longenough1'))
      .resolves.toEqual({ status: 'error', message: 'Chưa gắn được email. Thử lại.' })
  })
})

describe('passwords', () => {
  it('refuses a password shorter than the floor, before any network call', () => {
    expect(passwordProblem('a'.repeat(MIN_PASSWORD - 1))).toMatch(/ít nhất/)
    expect(passwordProblem('a'.repeat(MIN_PASSWORD))).toBeNull()
  })

  it('does not send a too-short password to Supabase at all', async () => {
    const { client, signUp } = fakeAuth()
    const outcome = await registerWithPassword(client, 'a@b.com', 'short')
    expect(outcome.status).toBe('error')
    expect(signUp).not.toHaveBeenCalled()
  })

  it('reports an active session when Supabase returns one', async () => {
    const { client } = fakeAuth()
    await expect(registerWithPassword(client, 'a@b.com', 'longenough1'))
      .resolves.toEqual({ status: 'active' })
  })

  // No mail is sent, so a sign-up that returns no session has nothing to wait for.
  it('reports an error when Supabase returns no session', async () => {
    const { client, signUp } = fakeAuth()
    signUp.mockResolvedValue({ data: { session: null }, error: null } as never)
    const outcome = await registerWithPassword(client, 'a@b.com', 'longenough1')
    expect(outcome.status).toBe('error')
  })

  it('sets a password on the account already signed in', async () => {
    const { client, updateUser } = fakeAuth()
    await expect(setPassword(client, 'longenough1')).resolves.toEqual({ status: 'active' })
    expect(updateUser).toHaveBeenCalledWith({ password: 'longenough1' })
  })
})

describe('signInWithPassword', () => {
  it('signs in when the browser holds no words', async () => {
    const { client, signInWithPassword: call } = fakeAuth()
    await expect(signInWithPassword(client, 'a@b.com', 'longenough1', 0))
      .resolves.toEqual({ status: 'active' })
    expect(call).toHaveBeenCalled()
  })

  // The password door has to refuse for the same reason the emailed one does:
  // signing in swaps the account under the words this browser is holding.
  it('refuses when the browser holds words, rather than stranding them', async () => {
    const { client, signInWithPassword: call } = fakeAuth()
    const outcome = await signInWithPassword(client, 'a@b.com', 'longenough1', 12)
    expect(outcome.status).toBe('error')
    expect(call).not.toHaveBeenCalled()
  })
})

// GoTrue answers in English. The code, not the message, picks what the learner reads.
describe('auth failures', () => {
  const refuse = (message: string, status: number, code: string) =>
    ({ data: { session: null, user: null }, error: new AuthApiError(message, status, code) }) as never

  it('says in Vietnamese that the new password matches the old one', async () => {
    const { client, updateUser } = fakeAuth()
    updateUser.mockResolvedValue(refuse('New password should be different from the old password.', 422, 'same_password'))
    await expect(setPassword(client, 'longenough1')).resolves
      .toEqual({ status: 'error', message: 'Mật khẩu mới trùng mật khẩu cũ. Chọn mật khẩu khác.' })
  })

  it('says in Vietnamese that the email or password is wrong', async () => {
    const { client, signInWithPassword: call } = fakeAuth()
    call.mockResolvedValue(refuse('Invalid login credentials', 400, 'invalid_credentials'))
    await expect(signInWithPassword(client, 'a@b.com', 'longenough1', 0)).resolves
      .toEqual({ status: 'error', message: 'Sai email hoặc mật khẩu.' })
  })

  it.each([
    ['over_email_send_rate_limit', 429, 'email rate limit exceeded', 'Thử quá nhiều lần. Chờ vài phút rồi thử lại.'],
    ['over_request_rate_limit', 429, 'Request rate limit reached', 'Thử quá nhiều lần. Chờ vài phút rồi thử lại.'],
    ['weak_password', 422, 'Password is known to be weak', 'Mật khẩu quá yếu. Chọn mật khẩu khác.'],
    ['user_already_exists', 422, 'User already registered', 'Email này đã có tài khoản.'],
    ['email_address_invalid', 400, 'Email address is invalid', 'Email không hợp lệ.'],
  ])('maps %s on sign-up to Vietnamese', async (code, status, english, vietnamese) => {
    const { client, signUp } = fakeAuth()
    signUp.mockResolvedValue(refuse(english, status, code))
    await expect(registerWithPassword(client, 'a@b.com', 'longenough1')).resolves
      .toEqual({ status: 'error', message: vietnamese })
  })

  // Sign-in refuses a browser holding words, so "Đăng nhập" beside this message led nowhere.
  it.each(['email_exists', 'user_already_exists'])('sends %s while attaching an email to another email', async (code) => {
    const { client, updateUser } = fakeAuth()
    updateUser.mockResolvedValue(refuse('A user with this email address has already been registered', 422, code))
    await expect(attachEmail(client, 'a@b.com', 'longenough1')).resolves
      .toEqual({ status: 'error', message: 'Email này đã có tài khoản. Dùng email khác.' })
  })

  // AuthSessionMissingError carries no code, only its name.
  it('says the session is gone when there is no session at all', async () => {
    const { client, updateUser } = fakeAuth()
    updateUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() } as never)
    await expect(setPassword(client, 'longenough1')).resolves
      .toEqual({ status: 'error', message: 'Phiên đăng nhập đã hết. Đăng nhập lại.' })
  })

  // An anonymous learner has no password to sign in with, so the way on is a fresh account.
  it.each([
    ['no session at all', new AuthSessionMissingError()],
    ['session_not_found', new AuthApiError('Session not found', 403, 'session_not_found')],
  ])('sends a learner attaching an email with %s to reload and create the account', async (_, error) => {
    const { client, updateUser } = fakeAuth()
    updateUser.mockResolvedValue({ data: { user: null }, error } as never)
    await expect(attachEmail(client, 'a@b.com', 'longenough1')).resolves
      .toEqual({ status: 'error', message: 'Phiên đăng nhập đã hết. Tải lại trang rồi tạo tài khoản.' })
  })

  // #59: this is what production answered while mail delivery was broken.
  it('falls back to Vietnamese for a code it does not know, never the English text', async () => {
    const { client, signUp, updateUser, signInWithPassword: call } = fakeAuth()
    signUp.mockResolvedValue(refuse('Error sending confirmation email', 500, 'unexpected_failure'))
    updateUser.mockResolvedValue(refuse('Something new', 400, 'a_code_from_a_newer_gotrue'))
    call.mockResolvedValue(refuse('Something new', 400, 'a_code_from_a_newer_gotrue'))

    await expect(registerWithPassword(client, 'a@b.com', 'longenough1')).resolves
      .toEqual({ status: 'error', message: 'Chưa tạo được tài khoản. Thử lại.' })
    await expect(setPassword(client, 'longenough1')).resolves
      .toEqual({ status: 'error', message: 'Chưa đặt được mật khẩu. Thử lại.' })
    await expect(attachEmail(client, 'a@b.com', 'longenough1')).resolves
      .toEqual({ status: 'error', message: 'Chưa gắn được email. Thử lại.' })
    await expect(signInWithPassword(client, 'a@b.com', 'longenough1', 0)).resolves
      .toEqual({ status: 'error', message: 'Chưa đăng nhập được. Thử lại.' })
  })
})

describe('safeNext', () => {
  const here = 'https://zhesen.app'
  const lands = (raw: string | null) => new URL(safeNext(raw, here), here).origin

  it('keeps a path on this site, query included', () => {
    expect(safeNext('/practice?mode=quiz', here)).toBe('/practice?mode=quiz')
  })
  it('falls back for a missing value', () => {
    expect(safeNext(null, here)).toBe('/wordlist')
  })

  // The value arrives in a URL anyone can hand the user. Checking the resolved
  // origin rather than a list of forbidden prefixes is the point: the first
  // version rejected '//evil.test' and let the backslash form through, because
  // WHATWG URL reads a backslash as a slash in an http(s) URL.
  const BACKSLASH = String.fromCharCode(92)

  it('sends the browser nowhere but this origin, whatever the input', () => {
    for (const hostile of [
      'https://evil.test/steal',
      '//evil.test/steal',
      '/' + BACKSLASH + 'evil.test/steal',
      '/' + BACKSLASH + BACKSLASH + 'evil.test',
      BACKSLASH + BACKSLASH + 'evil.test',
      '/..//evil.test',
      '/..//evil.test/phish?a=1',
      '/a/../..//evil.test',
    ]) {
      expect(lands(hostile)).toBe(here)
    }
  })

  // `lands` parses the answer a second time, which is what the callers do:
  // NextResponse.redirect(new URL(next, origin)) and router.push(next). That is
  // where '/..//evil.test' got through -- it resolves to the pathname
  // '//evil.test', whose origin is still this site, and only turns
  // protocol-relative on the second parse.
  it('does not hand back a path that becomes another host when it is resolved again', () => {
    expect(safeNext('/..//evil.test', here)).toBe('/wordlist')
    expect(safeNext('/..//evil.test/phish?a=1', here)).toBe('/wordlist')
  })

  it('does not silently keep a hostile path either', () => {
    expect(safeNext('/' + BACKSLASH + 'evil.test/steal', here)).toBe('/wordlist')
  })
})
