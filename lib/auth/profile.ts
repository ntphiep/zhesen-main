import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from '@/lib/zod'

/**
 * Display name and role, in `public.profiles` (migration 0032) because `auth.users` is not
 * readable from the browser. A trigger creates a row for every account, anonymous included.
 * The role is read here and never written: RLS refuses an update that changes it, so
 * anything gating on `admin` must gate in the database as well.
 */

const profileRow = z.object({
  id: z.string(),
  role: z.enum(['learner', 'admin']),
  display_name: z.string().nullable(),
})

export type Role = z.infer<typeof profileRow>['role']

export type Profile = {
  id: string
  role: Role
  displayName: string | null
}

function parseProfile(row: unknown): Profile {
  const x = profileRow.parse(row)
  return { id: x.id, role: x.role, displayName: x.display_name }
}

/** One account's profile, or null when there is no row. The id must be named rather than
 *  left to RLS: `profiles_select_own` (migration 0032) lets an admin read every profile, so
 *  an unfiltered query returns one row per account and `maybeSingle` refuses them all. */
export async function getProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, display_name')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data) return null
  return parseProfile(data)
}

export type SaveOutcome = { ok: true } | { ok: false; message: string }

/** Rename the account. Empty means "no name", a real choice, so it is stored as null. */
export async function setDisplayName(
  supabase: SupabaseClient,
  name: string,
): Promise<SaveOutcome> {
  const trimmed = name.trim()
  if (trimmed.length > 60) return { ok: false, message: 'Tên hiển thị tối đa 60 ký tự.' }
  // Said here rather than falling back to an empty id: `id=eq.` against a uuid column
  // raises 22P02, showing raw Postgres text for what is really an expired session.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại rồi thử lại.' }
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: trimmed || null })
    .eq('id', user.id)
  return error ? { ok: false, message: error.message } : { ok: true }
}
