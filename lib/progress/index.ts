import type { ProgressStore } from './ProgressStore'
import { SupabaseProgressStore } from './SupabaseProgressStore'
import { createClient } from '@/lib/supabase/client'

export type { ProgressStore } from './ProgressStore'

let instance: ProgressStore | null = null
export function getProgressStore(): ProgressStore {
  if (!instance) instance = new SupabaseProgressStore(createClient())
  return instance
}
