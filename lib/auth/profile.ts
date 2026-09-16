import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from '@/lib/zod'

/**
 * What the app knows about an account beyond "signed in or not".
 *
 * `auth.users` is not readable from the browser and cannot be extended, so the
 * two things the product needs -- what to call someone, and what they may do --
 * live in `public.profiles` (migration 0032). A row is created by a trigger on
 * every new account, anonymous ones included, so an anonymous learner who later
 * attaches an email keeps the same profile across the upgrade.
 *
 * The role is read here and never written here: RLS refuses an update that
 * changes it, so a client-side check is a convenience and the database is the
 * rule. Anything that gates on `admin` must still gate in the database as well.
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

/**
 * One account's profile, or null when there is no row for it.
 *
 * A missing row is null rather than an error: the trigger creates one, but an
 * account made before migration 0032 that somehow escaped the backfill should
 * degrade to "a learner with no name", not to a broken page.
 *
 * The id is named rather than left to RLS. `profiles_select_own` (migration
 * 0032) lets an admin read every profile, so an unfiltered query returns as many
 * rows as there are accounts and `maybeSingle` refuses them all -- the one
 * account that can see the most was the one that saw nothing.
 */
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

/**
 * Rename the account. Empty means "no name", which is a real choice rather than
 * a validation failure, so it is stored as null.
 */
export async function setDisplayName(
  supabase: SupabaseClient,
  name: string,
): Promise<SaveOutcome> {
  const trimmed = name.trim()
  if (trimmed.length > 60) return { ok: false, message: 'Tên hiển thị tối đa 60 ký tự.' }
  // Said here rather than by falling back to an empty id. `id=eq.` against a uuid
  // column raises 22P02, and the reader was shown the raw Postgres text for what
  // is really an expired session.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại rồi thử lại.' }
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: trimmed || null })
    .eq('id', user.id)
  return error ? { ok: false, message: error.message } : { ok: true }
}
