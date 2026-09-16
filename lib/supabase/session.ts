import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Create the anonymous session on first write instead of on first request.
 *
 * Browsing the dictionary needs no session at all -- `lex.*` is readable by
 * the anon API key. Minting a session on every request would mint a row in
 * `auth.users` for every crawler, prefetch and health check, and a burst of
 * them can exhaust Supabase's own sign-in limit, leaving a real visitor with
 * no session and their first saved word failing against RLS.
 *
 * Every write to `public.user_words` and `public.activity` goes through here, so
 * an account exists exactly when someone has data to put in it.
 *
 * Browser only. The in-flight promise below is shared process-wide, which is what
 * a single browser tab wants and what a server handling many users must not have.
 */

let signingIn: Promise<void> | null = null

export async function ensureSession(supabase: SupabaseClient): Promise<void> {
  const { data } = await supabase.auth.getSession()
  if (data.session) return
  // Saving several words at once must not start several sign-ins; the first call
  // to arrive owns the request and the rest wait on it.
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
