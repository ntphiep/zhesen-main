import { isAuthSessionMissingError, type AuthError, type SupabaseClient, type User } from '@supabase/supabase-js'

/**
 * An anonymous account lives in one browser's cookie, so clearing site data strands the
 * wordlist: it happened here, 407 saved words left in an account nothing could reach.
 * `attachEmail` keeps the SAME user id so no row is copied. `signInWithPassword` must
 * refuse a session that holds words -- signing in swaps the account.
 */

export type AccountKind = 'none' | 'anonymous' | 'permanent'

export function accountKind(user: User | null): AccountKind {
  if (!user) return 'none'
  return user.email ? 'permanent' : 'anonymous'
}

export type AuthOutcome =
  /** The session is live now. */
  | { status: 'active' }
  | { status: 'error'; message: string }

/** Supabase's own floor is six characters. Checked here so the message is in Vietnamese
 *  and arrives before the network call. */
export const MIN_PASSWORD = 8

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD) return `Mật khẩu cần ít nhất ${MIN_PASSWORD} ký tự.`
  return null
}

const SWITCH_WOULD_STRAND =
  'Trình duyệt này còn từ chưa gắn email. Gắn email cho sổ tay này trước.'

const RATE_LIMITED = 'Thử quá nhiều lần. Chờ vài phút rồi thử lại.'
export const SESSION_GONE = 'Phiên đăng nhập đã hết. Đăng nhập lại.'

/** Keyed on GoTrue's `code`, never its English `message`. Codes are `ErrorCode` in
 *  @supabase/auth-js (`dist/module/lib/error-codes.d.ts`). */
const AUTH_ERRORS = new Map<string, string>([
  ['invalid_credentials', 'Sai email hoặc mật khẩu.'],
  ['email_not_confirmed', 'Email này chưa xác nhận.'],
  ['user_already_exists', 'Email này đã có tài khoản.'],
  ['email_exists', 'Email này đã có tài khoản.'],
  ['email_address_invalid', 'Email không hợp lệ.'],
  ['validation_failed', 'Email hoặc mật khẩu không hợp lệ.'],
  ['weak_password', 'Mật khẩu quá yếu. Chọn mật khẩu khác.'],
  ['same_password', 'Mật khẩu mới trùng mật khẩu cũ. Chọn mật khẩu khác.'],
  ['over_request_rate_limit', RATE_LIMITED],
  ['over_email_send_rate_limit', RATE_LIMITED],
  ['signup_disabled', 'Tạm ngừng tạo tài khoản mới.'],
  ['user_banned', 'Tài khoản này đang bị khóa.'],
  ['session_not_found', SESSION_GONE],
  ['session_expired', SESSION_GONE],
  ['refresh_token_not_found', SESSION_GONE],
  ['bad_jwt', SESSION_GONE],
  ['user_not_found', SESSION_GONE],
  ['request_timeout', 'Chưa kết nối được. Thử lại.'],
])

/** The session is gone, not merely unreachable. AuthSessionMissingError has no code, only
 *  its name. */
export function sessionMissing(error: AuthError): boolean {
  return isAuthSessionMissingError(error) || (!!error.code && AUTH_ERRORS.get(error.code) === SESSION_GONE)
}

/** An unmapped or missing code gets `fallback`: the English text never reaches the page. */
function failed(error: AuthError, fallback: string, sessionGone = SESSION_GONE): AuthOutcome {
  if (sessionMissing(error)) return { status: 'error', message: sessionGone }
  return { status: 'error', message: (error.code && AUTH_ERRORS.get(error.code)) || fallback }
}

/** Sign-in refuses a browser holding words, so the way on from a taken email is another one. */
const TAKEN_WHILE_ATTACHING = new Set(['email_exists', 'user_already_exists'])

/**
 * Put an email and a password on the anonymous account holding this browser's words.
 * Supabase keeps the user id, so every row stays attached. GoTrue confirms the address
 * at once (GOTRUE_MAILER_AUTOCONFIRM in infra/supabase), which is what lets the
 * password ride along in the same call.
 * https://supabase.com/docs/guides/auth/auth-anonymous
 */
export async function attachEmail(
  supabase: SupabaseClient,
  email: string,
  password: string,
): Promise<AuthOutcome> {
  const problem = passwordProblem(password)
  if (problem) return { status: 'error', message: problem }
  const { error } = await supabase.auth.updateUser({ email, password })
  if (error?.code && TAKEN_WHILE_ATTACHING.has(error.code)) {
    return { status: 'error', message: 'Email này đã có tài khoản. Dùng email khác.' }
  }
  // An anonymous learner has no password to sign in again with.
  return error
    ? failed(error, 'Chưa gắn được email. Thử lại.', 'Phiên đăng nhập đã hết. Tải lại trang rồi tạo tài khoản.')
    : { status: 'active' }
}

/** Create an account from scratch. No mail is sent, so a missing session is a failure. */
export async function registerWithPassword(
  supabase: SupabaseClient,
  email: string,
  password: string,
): Promise<AuthOutcome> {
  const problem = passwordProblem(password)
  if (problem) return { status: 'error', message: problem }

  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) return failed(error, 'Chưa tạo được tài khoản. Thử lại.')
  if (!data.session) return { status: 'error', message: 'Tài khoản chưa sẵn sàng. Đăng nhập để tiếp tục.' }
  return { status: 'active' }
}

/** Sign in with a password. Refuses when the session already holds words: signing in
 *  swaps the account under them. */
export async function signInWithPassword(
  supabase: SupabaseClient,
  email: string,
  password: string,
  localWordCount: number,
): Promise<AuthOutcome> {
  if (localWordCount > 0) return { status: 'error', message: SWITCH_WOULD_STRAND }
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return error ? failed(error, 'Chưa đăng nhập được. Thử lại.') : { status: 'active' }
}

/** Set or replace the password on the account signed in. */
export async function setPassword(
  supabase: SupabaseClient,
  password: string,
): Promise<AuthOutcome> {
  const problem = passwordProblem(password)
  if (problem) return { status: 'error', message: problem }
  const { error } = await supabase.auth.updateUser({ password })
  return error ? failed(error, 'Chưa đặt được mật khẩu. Thử lại.') : { status: 'active' }
}

export async function signOut(supabase: SupabaseClient): Promise<void> {
  await supabase.auth.signOut()
}
