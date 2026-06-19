import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function createContentClient(): SupabaseClient {
  if (!client) {
    client = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
  }
  return client
}
