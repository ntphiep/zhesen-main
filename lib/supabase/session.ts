import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Create the anonymous session on first write instead of on first request.
 *
 * The middleware used to call `signInAnonymously` for every request that arrived
 * without a session cookie. Browsing the dictionary needs no session at all --
 * `lex.*` is readable by the anon API key -- so that minted a row in `auth.users`
 * for every crawler, prefetch and health check. A short burst of them exhausted
 * Supabase's own sign-in limit, and the server log filled with
 * "signInAnonymously failed: Request rate limit reached": at that point a real
 * visitor arriving next got no session either, and their first saved word failed
 * against RLS.
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
