import { cache } from 'react'
import { redirect } from 'next/navigation'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { accountKind } from '@/lib/auth/account'

/**
 * `auth.getUser()` asks the auth server every time it is called, and /practice
 * asks twice: once in the segment's layout, which guards the six mode pages, and
 * once in the page itself, which guards the statistics query. Memoised per
 * request against the client from lib/supabase/server.ts, which is memoised too,
 * the second ask costs nothing.
 */
const currentUser = cache(
  async (supabase: SupabaseClient): Promise<User | null> => (await supabase.auth.getUser()).data.user,
)

/**
 * The door every account-only page goes through.
 *
 * Which door depends on what this browser already holds. An anonymous session
 * goes to /register, which attaches an email to the SAME account so its saved
 * words survive the trip; a browser with nothing goes to /login. `next` brings
 * the reader back to the page they asked for.
 *
 * Callers must `await` this BEFORE their own queries rather than alongside them.
 * `/practice` used to run `getWordlistStats` in the same `Promise.all` as the
 * session read, so a visitor with no account still paid for two queries, and a
 * query that threw turned a redirect into a 500.
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
