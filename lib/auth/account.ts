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
 * The fix is not a login wall. It is an optional email on the account the learner
 * already has:
 *
 *   - `attachEmail` keeps the SAME user id and every row hanging off it, so
 *     nothing has to be copied and nothing can be lost in the copying. This is
 *     the call for a browser that already holds the words.
 *   - `signInByEmail` is the other direction: a browser with no words asking for
 *     an account that exists elsewhere. It must never be used on a session that
 *     has data, because signing in switches accounts and leaves that data behind
 *     -- which is exactly the failure this module exists to prevent. `AccountPanel`
 *     enforces that, and the guard here is the second lock on the same door.
 */

export type AccountKind = 'none' | 'anonymous' | 'permanent'

export function accountKind(user: User | null): AccountKind {
  if (!user) return 'none'
  return user.email ? 'permanent' : 'anonymous'
}

export type AuthOutcome =
  | { status: 'sent' }
  | { status: 'error'; message: string }

/** Where Supabase sends the browser back after the emailed link is opened. */
function redirectTo(): string {
  return `${window.location.origin}/auth/callback?next=/wordlist`
}

/**
 * Put an email on the anonymous account that holds this browser's words.
 *
 * Supabase keeps the user id, so the wordlist, the review schedule and the streak
 * all stay attached. Confirming the emailed link is what makes the account
 * reachable from anywhere else.
 */
export async function attachEmail(supabase: SupabaseClient, email: string): Promise<AuthOutcome> {
  const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: redirectTo() })
  return error ? { status: 'error', message: error.message } : { status: 'sent' }
}

/**
 * Sign in to an account that already exists, on a browser that has none.
 *
 * Refuses when the current session has saved words: signing in would swap the
 * account under them and strand exactly the data this is meant to protect.
 */
export async function signInByEmail(
  supabase: SupabaseClient,
  email: string,
  localWordCount: number,
): Promise<AuthOutcome> {
  if (localWordCount > 0) {
    return {
      status: 'error',
      message: 'Trình duyệt này đang có từ chưa gắn email. Hãy lưu email cho sổ tay hiện tại trước.',
    }
  }
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo() },
  })
  return error ? { status: 'error', message: error.message } : { status: 'sent' }
}
