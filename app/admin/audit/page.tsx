import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { listAudit } from '@/lib/admin/audit'
import { PageHeader } from '@/components/admin/Page'
import { AuditLog } from '@/components/admin/AuditLog'

export const metadata = { title: 'Audit log · Admin' }

const LIMIT = 200

export default async function AdminAuditPage() {
  const supabase = await createClient()
  await requireAdmin(supabase)
  const entries = await listAudit(supabase, LIMIT)
  return (
    <div>
      <PageHeader title="Audit log" />
      <div className="mt-6"><AuditLog entries={entries} /></div>
    </div>
  )
}
