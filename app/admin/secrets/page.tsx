import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { PageHeader } from '@/components/admin/Page'
import { SecretsTable } from '@/components/admin/SecretsTable'

export const metadata = { title: 'Secrets · Admin' }

/** The rows load in the browser, so no value, not even its last four characters, is in
 *  this page's HTML. */
export default async function AdminSecretsPage() {
  const supabase = await createClient()
  await requireAdmin(supabase)
  return (
    <div>
      <PageHeader title="Secrets" lead="Every key this deployment uses, where it lives, and what changing it sets off." />
      <SecretsTable />
    </div>
  )
}
