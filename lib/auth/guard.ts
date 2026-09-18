import { cache } from 'react'
import { redirect } from 'next/navigation'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { accountKind } from '@/lib/auth/account'

/** `auth.getUser()` asks the auth server every call, and /practice asks twice: in the
 *  segment layout and again in the page. Memoised per request against the equally memoised
 *  client from lib/supabase/server.ts, the second ask costs nothing. */
const currentUser = cache(
  async (supabase: SupabaseClient): Promise<User | null> => (await supabase.auth.getUser()).data.user,
)

/**
 * The door every account-only page goes through: an anonymous session to /register, which
 * attaches an email to the SAME account so saved words survive; a browser holding nothing
 * to /login. Callers must `await` this BEFORE their own queries, never alongside them in a
 * `Promise.all`, or a visitor with no account still pays and a throw becomes a 500.
 */
export async function requirePermanentAccount(
  supabase: SupabaseClient,
  next: string,
  carry: Record<string, string> = {},
): Promise<User> {
  const user = await currentUser(supabase)
  const kind = accountKind(user)
  if (kind === 'permanent' && user) return user
  const params = new URLSearchParams(carry)
  params.set('next', next)
  redirect(`${kind === 'anonymous' ? '/register' : '/login'}?${params}`)
}
