import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const FALLBACK = '/wordlist'

/**
 * Where the emailed link lands. Trades the one-time code for a session cookie,
 * then sends the browser on.
 *
 * `next` arrives in a URL anyone can hand the user, so it is confined to this
 * site. The check resolves it with the SAME parser that will perform the
 * redirect and then compares origins, rather than rejecting a list of prefixes:
 * a first attempt here rejected `//evil.test` and let `/\evil.test` through,
 * because WHATWG URL treats a backslash as a slash in an http(s) URL. Measured:
 * `new URL('/\evil.test/x', 'https://zhesen.app').origin` is `https://evil.test`.
 * Only the parser knows what it will do with exotic input, so ask it.
 */
export function safeNext(raw: string | null, origin: string): string {
  if (!raw) return FALLBACK
  let resolved: URL
  try {
    resolved = new URL(raw, origin)
  } catch {
    return FALLBACK
  }
  if (resolved.origin !== new URL(origin).origin) return FALLBACK
  return resolved.pathname + resolved.search
}

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
