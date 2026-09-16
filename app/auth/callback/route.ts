import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeNext } from '@/lib/auth/redirect'

export { safeNext } from '@/lib/auth/redirect'

/** Where the emailed link lands when it carries no usable destination. */
const FALLBACK = '/wordlist'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = safeNext(url.searchParams.get('next'), url.origin)

  if (!code) return NextResponse.redirect(new URL(`${FALLBACK}?auth=missing`, url.origin))

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(new URL(`${FALLBACK}?auth=failed`, url.origin))
  return NextResponse.redirect(new URL(next, url.origin))
}
