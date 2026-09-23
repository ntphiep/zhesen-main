import { cache } from 'react'
import { notFound } from 'next/navigation'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { accountKind } from '@/lib/auth/account'
import { requirePermanentAccount } from '@/lib/auth/guard'
import { getProfile } from '@/lib/auth/profile'

/**
 * The server half of the admin gate. The database half is `admin.assert_admin()`
 * (supabase/migrations/0056_admin_metrics_rpc.sql), which every admin function calls
 * first; this one only decides what a page or a route answers.
 *
 * `getProfile` returns null both for a missing row and for a failed query, and both
 * read as "not admin": a network error must never open the door.
 */
async function isAdmin(supabase: SupabaseClient, user: User): Promise<boolean> {
  const profile = await getProfile(supabase, user.id)
  return profile?.role === 'admin'
}

/** For pages. A learner gets the 404 page rather than a refusal, so /admin does not
 *  reveal that it exists; anyone without a permanent account goes through the usual
 *  door. Memoised per request, because the layout and the page both call it and a
 *  layout alone is not re-run on client navigation between admin pages. */
export const requireAdmin = cache(async (supabase: SupabaseClient): Promise<User> => {
  const user = await requirePermanentAccount(supabase, '/admin')
  if (!(await isAdmin(supabase, user))) notFound()
  return user
})

/** For route handlers, where a redirect is useless to `fetch`: null means answer 404. */
export async function adminUser(supabase: SupabaseClient): Promise<User | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || accountKind(user) !== 'permanent') return null
  return (await isAdmin(supabase, user)) ? user : null
}
