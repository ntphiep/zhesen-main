import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseEnv } from './env'

let client: SupabaseClient | null = null

export function createContentClient(): SupabaseClient {
  if (!client) {
    const { url, anonKey } = supabaseEnv()
    client = createSupabaseClient(
      url,
      anonKey,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
  }
  return client
}
