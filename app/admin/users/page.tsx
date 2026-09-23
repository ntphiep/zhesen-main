import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { listAccounts } from '@/lib/admin/users'
import { AccountTable } from '@/components/admin/AccountTable'

export const metadata = { title: 'Tài khoản · Quản trị' }

export default async function AdminUsersPage() {
  const supabase = await createClient()
  await requireAdmin(supabase)
  const accounts = await listAccounts(supabase)
  return <AccountTable accounts={accounts} />
}
