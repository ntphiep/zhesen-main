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

  // Use getSession (reads the session from the cookie locally, refreshing only
  // when the token is expired) instead of getUser (which makes a network call to
  // the Auth server on every request). We only need to know whether an anonymous
  // session already exists, not to authorize anything, so the local check is safe.
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    const { error } = await supabase.auth.signInAnonymously()
    if (error) console.error('[proxy] signInAnonymously failed:', error.message)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
