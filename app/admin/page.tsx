import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { getMetrics } from '@/lib/admin/metrics'
import { listAudit } from '@/lib/admin/audit'
import { integrations } from '@/lib/admin/cache'
import { awsHealthConfig, getHealth } from '@/lib/admin/aws'
import { probeAuth } from '@/lib/admin/architecture'
import { PageHeader, Section } from '@/components/admin/Page'
import {
  CapacitySection, DictionarySection, PeopleSection, SystemStrip, systemChecks, type AwsView,
} from '@/components/admin/Overview'
import { OperationsPanel } from '@/components/admin/OperationsPanel'
import { AuditLog } from '@/components/admin/AuditLog'

async function readAws(): Promise<AwsView> {
  const cfg = awsHealthConfig()
  if (!cfg) return { state: 'off' }
  try {
    const h = await getHealth(cfg)
    return { state: 'ok', alarms: h.alarms, dump: h.dump }
  } catch (e) {
    // The error name (AccessDenied, ExpiredToken) says what to fix; the message can carry ARNs.
    return { state: 'error', name: e instanceof Error ? e.name : 'Error' }
  }
}

export default async function AdminPage() {
  const supabase = await createClient()
  await requireAdmin(supabase)
  const readAt = new Date()
  const [metrics, audit, auth, aws] = await Promise.all([
    getMetrics(supabase), listAudit(supabase, 5), probeAuth(), readAws(),
  ])
  const disk = aws.state === 'ok' ? aws.alarms.find((a) => a.metric === 'disk_used_percent')?.latest ?? null : null

  return (
    <div>
      <PageHeader
        title="Tổng quan"
        lead="Trạng thái từng thành phần, người dùng, từ điển và dung lượng, đọc trực tiếp từ database và AWS."
        readAt={readAt}
      />
      <SystemStrip checks={systemChecks(metrics, auth, aws, readAt.getTime())} />
      <PeopleSection m={metrics} />
      <DictionarySection m={metrics} />
      <CapacitySection m={metrics} diskPercent={disk} />
      <Section title="Vận hành">
        <OperationsPanel integrations={integrations()} />
      </Section>
      <Section title="Thao tác gần đây" aside={<Link href="/admin/audit" prefetch={false} className="hover:underline">Xem toàn bộ nhật ký</Link>}>
        <AuditLog entries={audit} />
      </Section>
    </div>
  )
}
