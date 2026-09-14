import type { SupabaseClient, User } from '@supabase/supabase-js'

/**
 * Turning the browser-bound wordlist into something that survives the browser.
 *
 * The app deliberately has no login wall -- looking a word up needs no account,
 * and `ensureSession` mints an anonymous one only on the first write. The cost of
 * that is real and was paid: an anonymous account lives in one browser's cookie,
 * so clearing site data, switching browser or losing the profile strands the
 * wordlist. It happened here, with 407 saved words left behind in an account
 * nothing could reach any more.
 *
 * The fix is not a login wall. It is a real account the learner can reach from
 * anywhere, reached by whichever of three doors they are standing at:
 *
 *   - `attachEmail` keeps the SAME user id and every row hanging off it, so
 *     nothing has to be copied and nothing can be lost in the copying. This is
 *     the door for a browser that already holds the words.
 *   - `registerWithPassword` is the front door for a browser that holds nothing.
 *   - `signInWithPassword` and `signInByEmail` are the way back in. Both refuse a
 *     session that already has data, because signing in switches accounts and
 *     leaves that data behind -- which is exactly the failure this module exists
 *     to prevent. `AccountPanel` enforces that too; the guard here is the second
 *     lock on the same door.
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

/** Supabase's own floor is six characters; eight is the common recommendation
 *  and the extra two cost a learner nothing. Checked here so the message is in
 *  Vietnamese and arrives before the network call. */
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
 * Put an email on the anonymous account that holds this browser's words.
 *
 * Supabase keeps the user id, so the wordlist, the review schedule and the streak
 * all stay attached. Confirming the emailed link is what makes the account
 * reachable from anywhere else.
 *
 * A password cannot be set in the same call: Supabase requires the address to be
 * verified before it will accept one ("the user's email or phone number needs to
 * be verified first"), so `/account` offers that as the step after the link.
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

/**
 * Create an account from scratch, on a browser that holds nothing.
 *
 * Whether the session is live immediately or waits on a confirmation email is a
 * project setting, so the answer comes from the response rather than from an
 * assumption here.
 */
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

/**
 * Sign in with a password, on a browser that has nothing to lose.
 *
 * Refuses when the current session has saved words, for the reason in the module
 * comment: signing in swaps the account under them.
 */
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

/**
 * Sign in to an account that already exists, without a password.
 *
 * Kept alongside the password door: a learner who set an email months ago and
 * never a password has no other way back in, and a forgotten password needs the
 * same link.
 */
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

/**
 * Set or replace the password on an account whose email is already confirmed.
 *
 * This is the second half of the anonymous upgrade, and the whole of "I forgot
 * my password" once the emailed link has put a session in place.
 */
export async function setPassword(
  supabase: SupabaseClient,
  password: string,
): Promise<AuthOutcome> {
  const problem = passwordProblem(password)
  if (problem) return { status: 'error', message: problem }
  const { error } = await supabase.auth.updateUser({ password })
  return error ? { status: 'error', message: error.message } : { status: 'active' }
}

/** Ask for a reset link. Same mechanism as the passwordless door, different
 *  wording in the email, and it is allowed on a browser that holds words: it
 *  changes nothing until the link is opened. */
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
