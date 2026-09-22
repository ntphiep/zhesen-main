/**
 * The two variables every Supabase client needs, checked once and named when
 * they are missing.
 *
 * All four constructors used to assert them non-null. A deployment that forgot
 * one then failed inside `@supabase/ssr` with `TypeError: Invalid URL`, which
 * says nothing about which variable is missing or where to set it.
 *
 * The two reads are written out literally rather than looked up by name: Next
 * substitutes `process.env.NEXT_PUBLIC_*` into the client bundle only for a
 * literal member expression, and `process.env[name]` would leave the browser
 * with undefined.
 */
/**
 * The cookie name @supabase/ssr derives from the host, pinned to the value it had
 * on Supabase Cloud so a session survives the move to the CloudFront host
 * (2026-09-23). Unpinned, every signed-in browser would silently lose its
 * account, including the anonymous one holding 410 of the 444 saved words.
 */
export const SUPABASE_AUTH_COOKIE = 'sb-cvltsyoweddhpkomuevz-auth-token'

export function supabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    const missing = [!url && 'NEXT_PUBLIC_SUPABASE_URL', !anonKey && 'NEXT_PUBLIC_SUPABASE_ANON_KEY']
      .filter(Boolean)
      .join(' and ')
    throw new Error(`Missing ${missing}. Set it in .env.local for local runs, or in the deployment's environment variables.`)
  }
  return { url, anonKey }
}
