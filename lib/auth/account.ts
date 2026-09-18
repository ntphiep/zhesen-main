import type { SupabaseClient, User } from '@supabase/supabase-js'

/**
 * An anonymous account lives in one browser's cookie, so clearing site data strands the
 * wordlist: it happened here, 407 saved words left in an account nothing could reach.
 * `attachEmail` keeps the SAME user id so no row is copied. `signInWithPassword` and
 * `signInByEmail` must refuse a session that holds words -- signing in swaps the account.
 */

export type AccountKind = 'none' | 'anonymous' | 'permanent'

export function accountKind(user: User | null): AccountKind {
  if (!user) return 'none'
  return user.email ? 'permanent' : 'anonymous'
}

export type AuthOutcome =
  /** A confirmation link is in the inbox; nothing has changed yet. */
  | { status: 'sent' }
  /** The session is live now, no email round trip needed. */
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
  'Trình duyệt này đang có từ chưa gắn email. Hãy lưu email cho sổ tay hiện tại trước.'

/** Where Supabase sends the browser back after an emailed link is opened. */
function redirectTo(next = '/wordlist'): string {
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
}

/**
 * Put an email on the anonymous account holding this browser's words. Supabase keeps the
 * user id, so every row stays attached. A password cannot be set in the same call:
 * Supabase requires the address verified first.
 * https://supabase.com/docs/guides/auth/auth-anonymous
 */
export async function attachEmail(
  supabase: SupabaseClient,
  email: string,
  next = '/account',
): Promise<AuthOutcome> {
  const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: redirectTo(next) })
  return error ? { status: 'error', message: error.message } : { status: 'sent' }
}

/** Create an account from scratch. Whether the session is live at once or waits on a
 *  confirmation email is a project setting, so the answer comes from the response. */
export async function registerWithPassword(
  supabase: SupabaseClient,
  email: string,
  password: string,
  next = '/wordlist',
): Promise<AuthOutcome> {
  const problem = passwordProblem(password)
  if (problem) return { status: 'error', message: problem }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: redirectTo(next) },
  })
  if (error) return { status: 'error', message: error.message }
  return data.session ? { status: 'active' } : { status: 'sent' }
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

/** Sign in without a password. A learner who set an email but never a password has no
 *  other way back in, and a forgotten password needs the same link. */
export async function signInByEmail(
  supabase: SupabaseClient,
  email: string,
  localWordCount: number,
  next = '/wordlist',
): Promise<AuthOutcome> {
  if (localWordCount > 0) return { status: 'error', message: SWITCH_WOULD_STRAND }
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo(next) },
  })
  return error ? { status: 'error', message: error.message } : { status: 'sent' }
}

/** Set or replace the password on an account whose email is already confirmed. */
export async function setPassword(
  supabase: SupabaseClient,
  password: string,
): Promise<AuthOutcome> {
  const problem = passwordProblem(password)
  if (problem) return { status: 'error', message: problem }
  const { error } = await supabase.auth.updateUser({ password })
  return error ? { status: 'error', message: error.message } : { status: 'active' }
}

/** Ask for a reset link. Allowed on a browser that holds words: nothing changes until
 *  the link is opened. */
export async function requestPasswordReset(
  supabase: SupabaseClient,
  email: string,
): Promise<AuthOutcome> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectTo('/account'),
  })
  return error ? { status: 'error', message: error.message } : { status: 'sent' }
}

export async function signOut(supabase: SupabaseClient): Promise<void> {
  await supabase.auth.signOut()
}
