import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeNext } from '@/lib/auth/redirect'

/**
 * Where a link that did not work sends the reader.
 *
 * /login, not /wordlist. A failed exchange leaves no session, and /wordlist
 * demands one, so the reader was bounced on to /register and landed on a blank
 * form with nothing saying the link had expired. /login reads the `auth`
 * parameter and says so.
 */
const FAILURE_DOOR = '/login'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = safeNext(url.searchParams.get('next'), url.origin)

  if (!code) return NextResponse.redirect(new URL(`${FAILURE_DOOR}?auth=missing`, url.origin))

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(new URL(`${FAILURE_DOOR}?auth=failed`, url.origin))
  return NextResponse.redirect(new URL(next, url.origin))
}
