import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { getMetrics } from '@/lib/admin/metrics'
import { listAudit } from '@/lib/admin/audit'
import { integrations } from '@/lib/admin/cache'
import { StatGrid } from '@/components/admin/StatGrid'
import { OperationsPanel } from '@/components/admin/OperationsPanel'
import { AuditLog } from '@/components/admin/AuditLog'

export default async function AdminPage() {
  const supabase = await createClient()
  await requireAdmin(supabase)
  const [metrics, audit] = await Promise.all([getMetrics(supabase), listAudit(supabase)])

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="mb-3 text-lg font-semibold">Dữ liệu</h2>
        <StatGrid metrics={metrics} />
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Vận hành</h2>
        <OperationsPanel integrations={integrations()} />
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Nhật ký quản trị</h2>
        <AuditLog entries={audit} />
      </section>
    </div>
  )
}
