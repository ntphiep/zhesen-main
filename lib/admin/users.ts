import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from '@/lib/zod'

/** `admin.users()` (supabase/migrations/0057_admin_users_rpc.sql). */
const accountRow = z.object({
  id: z.string(),
  email: z.string().nullable(),
  role: z.enum(['learner', 'admin']),
  display_name: z.string().nullable(),
  created_at: z.string(),
  words: z.number(),
  last_active_at: z.string().nullable(),
})

export interface AdminAccount {
  id: string
  email: string | null
  /** Permanent when it carries an email, as `accountKind` in lib/auth/account.ts decides. */
  kind: 'permanent' | 'anonymous'
  role: 'learner' | 'admin'
  displayName: string | null
  createdAt: string
  words: number
  lastActiveAt: string | null
}

export function parseAccounts(raw: unknown): AdminAccount[] {
  return z.array(accountRow).parse(raw).map((x) => ({
    id: x.id,
    email: x.email,
    kind: x.email ? 'permanent' : 'anonymous',
    role: x.role,
    displayName: x.display_name,
    createdAt: x.created_at,
    words: x.words,
    lastActiveAt: x.last_active_at,
  }))
}

export async function listAccounts(supabase: SupabaseClient): Promise<AdminAccount[]> {
  const { data, error } = await supabase.schema('admin').rpc('users')
  if (error) throw error
  return parseAccounts(data)
}

/** What the deletion dialog asks the admin to type: the email, or the id when there is none. */
export function confirmationFor(a: Pick<AdminAccount, 'id' | 'email'>): string {
  return a.email ?? a.id
}

/** The refusals `admin.delete_account` and `admin.merge_account` raise (0059), in words. */
export const ACCOUNT_REFUSALS: Record<string, string> = {
  no_such_account: 'This account no longer exists.',
  admin_account: 'An admin account cannot be deleted from here.',
  confirm_mismatch: 'The confirmation text does not match.',
  same_account: 'The two accounts must be different.',
}
