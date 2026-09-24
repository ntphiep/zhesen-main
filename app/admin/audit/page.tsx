import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { listAudit } from '@/lib/admin/audit'
import { PageHeader } from '@/components/admin/Page'
import { AuditLog } from '@/components/admin/AuditLog'

export const metadata = { title: 'Nhật ký · Quản trị' }

const LIMIT = 200

export default async function AdminAuditPage() {
  const supabase = await createClient()
  await requireAdmin(supabase)
  const entries = await listAudit(supabase, LIMIT)
  return (
    <div>
      <PageHeader
        title="Nhật ký"
        lead={`Mọi thao tác ghi của quản trị viên, mới nhất trước, tối đa ${LIMIT} dòng. Mỗi dòng giữ giá trị trước và sau khi đổi.`}
      />
      <div className="mt-6"><AuditLog entries={entries} /></div>
    </div>
  )
}
