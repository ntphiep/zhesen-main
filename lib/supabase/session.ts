import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Create the anonymous session on first write, never on first request: `lex.*` is readable
 * by the anon key, and minting per request adds an `auth.users` row for every crawler and
 * prefetch until Supabase's sign-in limit locks real visitors out. Every write to
 * `user_words` and `activity` must call this. Browser only -- the in-flight promise below
 * is process-wide, which a server handling many users must not have.
 */

let signingIn: Promise<void> | null = null

export async function ensureSession(supabase: SupabaseClient): Promise<void> {
  const { data } = await supabase.auth.getSession()
  if (data.session) return
  // Saving several words at once must not start several sign-ins: the first call owns the
  // request and the rest wait on it.
  signingIn ??= supabase.auth
    .signInAnonymously()
    .then(({ error }) => {
      if (error) throw error
    })
    .finally(() => {
      signingIn = null
    })
  await signingIn
}

/** Drop the shared in-flight sign-in. For tests, which reuse the module. */
export function resetSessionState(): void {
  signingIn = null
}
