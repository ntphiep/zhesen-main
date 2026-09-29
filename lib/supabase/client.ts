'use client'

import { createBrowserClient } from '@supabase/ssr'
import { SUPABASE_AUTH_COOKIE, supabaseEnv } from './env'

const failures = new Set<() => void>()

/** Calls `listener` whenever a request of the browser client fails to reach the server or gets
 *  a 5xx. postgrest-js 2.116 retries a failed GET after 1, 2 and 4 s (`fetchWithRetry`), so the
 *  query itself rejects about 7 s after its first failure. */
export function onRequestFailure(listener: () => void): () => void {
  failures.add(listener)
  return () => { failures.delete(listener) }
}

function report(): void {
  for (const listener of [...failures]) listener()
}

const watchedFetch: typeof fetch = (input, init) =>
  fetch(input, init).then(
    (res) => { if (res.status >= 500) report(); return res },
    (e: unknown) => { report(); throw e },
  )

export function createClient() {
  const { url, anonKey } = supabaseEnv()
  return createBrowserClient(
    url,
    anonKey,
    { cookieOptions: { name: SUPABASE_AUTH_COOKIE }, global: { fetch: watchedFetch } },
  )
}
