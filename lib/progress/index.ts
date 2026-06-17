import type { ProgressStore } from './ProgressStore'
import { SupabaseProgressStore } from './SupabaseProgressStore'
import type { Client } from './SupabaseProgressStore'
import { createClient } from '@/lib/supabase/client'

// The browser Supabase client satisfies Client's structural contract at runtime.
// The cast is required because PostgrestQueryBuilder's chained methods return a
// more-specific subtype than the local QueryBuilder alias.
let instance: ProgressStore | null = null
export function getProgressStore(): ProgressStore {
  if (!instance) instance = new SupabaseProgressStore(createClient() as unknown as Client)
  return instance
}
