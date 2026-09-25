import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { listAccounts } from '@/lib/admin/users'
import { AccountTable } from '@/components/admin/AccountTable'
import { PageHeader } from '@/components/admin/Page'

export const metadata = { title: 'Users · Admin' }

export default async function AdminUsersPage() {
  const supabase = await createClient()
  await requireAdmin(supabase)
  const accounts = await listAccounts(supabase)
  return (
    <div>
      <PageHeader title="Users" />
      <div className="mt-6"><AccountTable accounts={accounts} /></div>
    </div>
  )
}
