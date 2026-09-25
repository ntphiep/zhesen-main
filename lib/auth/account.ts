import type { SupabaseClient, User } from '@supabase/supabase-js'

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
  return error ? { status: 'error', message: error.message } : { status: 'active' }
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
  if (error) return { status: 'error', message: error.message }
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
  return error ? { status: 'error', message: error.message } : { status: 'active' }
}

/** Set or replace the password on the account signed in. */
export async function setPassword(
  supabase: SupabaseClient,
  password: string,
): Promise<AuthOutcome> {
  const problem = passwordProblem(password)
  if (problem) return { status: 'error', message: problem }
  const { error } = await supabase.auth.updateUser({ password })
  return error ? { status: 'error', message: error.message } : { status: 'active' }
}

export async function signOut(supabase: SupabaseClient): Promise<void> {
  await supabase.auth.signOut()
}
