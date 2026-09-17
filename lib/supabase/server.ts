import { cache } from 'react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseEnv } from './env'

/**
 * Memoised for the length of one request, so a layout and the page inside it get
 * the same client rather than two. On its own that only saves an object; what it
 * buys is a stable argument for `currentUser` in lib/auth/guard.ts, which is how
 * the two session reads on /practice become one call to the auth server.
 */
export const createClient = cache(async function createClient() {
  const cookieStore = await cookies()
  const { url, anonKey } = supabaseEnv()
  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Called from a Server Component; middleware refreshes the session
          }
        },
      },
    },
  )
})
