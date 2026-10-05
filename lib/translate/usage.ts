import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from '@/lib/zod'

/**
 * The month's Azure Translator characters, counted per UTC day in admin.translate_usage
 * (supabase/migrations/0170_translate_usage.sql) through `public.translate_usage`.
 */

/** The F0 allowance: "2 million characters ... free per month" on Azure's Translator
 *  pricing page. The service-limits page caps F0 at 2 million an hour, not a month. */
export const MONTHLY_BUDGET = 2_000_000

/** A count this old is still good enough to refuse on, and saves a query per passage. */
const FRESH_MS = 60_000

const total = z.number().int().nonnegative()

let known: { at: number; chars: number } | null = null

/** Null when the count cannot be read: the budget then refuses nothing, because Azure's
 *  own quota still stands behind it. */
async function call(supabase: SupabaseClient, chars: number, now: number): Promise<number | null> {
  try {
    const { data, error } = await supabase.rpc('translate_usage', { p_chars: chars })
    if (error) throw new Error(error.message)
    const n = total.parse(data)
    known = { at: now, chars: n }
    return n
  } catch (e) {
    console.error('translate usage failed', e)
    return null
  }
}

/** Characters charged this calendar month (UTC), or null when unknown. */
export async function monthUsage(supabase: SupabaseClient, now: number = Date.now()): Promise<number | null> {
  if (known && now - known.at < FRESH_MS) return known.chars
  return call(supabase, 0, now)
}

export async function recordUsage(supabase: SupabaseClient, chars: number, now: number = Date.now()): Promise<void> {
  if (chars > 0) await call(supabase, chars, now)
}

/** Drop the remembered count, for tests. */
export function resetUsage(): void {
  known = null
}
