'use client'

import { createBrowserClient } from '@supabase/ssr'
import { SUPABASE_AUTH_COOKIE, supabaseEnv } from './env'

export function createClient() {
  const { url, anonKey } = supabaseEnv()
  return createBrowserClient(
    url,
    anonKey,
    { cookieOptions: { name: SUPABASE_AUTH_COOKIE } },
  )
}
