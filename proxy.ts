import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
