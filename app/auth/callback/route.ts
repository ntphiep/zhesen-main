import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Where the emailed link lands. Trades the one-time code for a session cookie,
 * then sends the browser on.
 *
 * `next` is confined to a path on this site: it arrives in a URL anyone can hand
 * the user, and an unchecked value here is an open redirect.
 */
export function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/wordlist'
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = safeNext(url.searchParams.get('next'))

  if (!code) return NextResponse.redirect(new URL('/wordlist?auth=missing', url.origin))

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(new URL('/wordlist?auth=failed', url.origin))
  return NextResponse.redirect(new URL(next, url.origin))
}
