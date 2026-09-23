import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { SUPABASE_AUTH_COOKIE, supabaseEnv } from '@/lib/supabase/env'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const { url, anonKey } = supabaseEnv()
  const supabase = createServerClient(
    url,
    anonKey,
    {
      cookieOptions: { name: SUPABASE_AUTH_COOKIE },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Refresh the session and write the rotated cookies back, nothing more.
  // getSession reads the cookie locally and only calls the Auth server when the
  // access token has expired (see GoTrueClient.__loadSession), where getUser
  // would make a network call on every single request.
  //
  // Creating the session is deliberately NOT done here. Reading the dictionary
  // needs no account, so signing in on every cookie-less request minted an
  // auth.users row for every crawler and prefetch, and a burst of them exhausted
  // Supabase's sign-in limit for the real visitors behind it. The first saved
  // word creates the account instead; see lib/supabase/session.ts.
  await supabase.auth.getSession()

  return response
}

// Only the routes whose server code reads the session. Everything else -- the
// dictionary, the grammar notes, the level lists, the search route -- is answered
// from cached data that never looks at a cookie, and running this proxy on them
// bought nothing while costing every one of those requests a hop: measured against
// production, `/robots.txt` (matched) answered in 178 ms and `/icon.svg` (excluded
// by the old matcher's file-extension rule) in 115 ms, both static CDN hits.
//
// It also kept those routes out of the shared cache whenever the session happened
// to rotate on them, because a response carrying Set-Cookie is not cacheable at all.
// https://vercel.com/docs/caching/cdn-cache#cacheable-response-criteria
//
// The browser client refreshes its own token (lib/supabase/client.ts), so a reader
// who never leaves the dictionary loses nothing by not being refreshed here.
export const config = {
  matcher: [
    '/account/:path*', '/wordlist/:path*', '/practice/:path*', '/login', '/register', '/auth/:path*',
    '/admin/:path*', '/api/admin/:path*',
  ],
}
