import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { awsHealthConfig, getHealth, getHistory, type Health, type Range, type Series } from '@/lib/admin/aws'
import { getSlowQueries, type SlowQuery } from '@/lib/admin/monitor'
import { PageHeader, Section } from '@/components/admin/Page'
import { HostPanel, LivePanel, LogViewer } from '@/components/admin/MonitorLive'
import { Chart, RangeSwitch, SlowQueries } from '@/components/admin/History'
import { HealthPanel } from '@/components/admin/HealthPanel'

export const metadata = { title: 'Giám sát · Quản trị' }

type Aws = { state: 'off' } | { state: 'error'; name: string } | { state: 'ok'; health: Health; history: Series[] }

async function readAws(range: Range): Promise<Aws> {
  const cfg = awsHealthConfig()
  if (!cfg) return { state: 'off' }
  try {
    const [health, history] = await Promise.all([getHealth(cfg), getHistory(cfg, range)])
    return { state: 'ok', health, history }
  } catch (e) {
    // The error name (AccessDenied, ExpiredToken) says what to fix; the message can carry ARNs.
    return { state: 'error', name: e instanceof Error ? e.name : 'Error' }
  }
}

async function readSlow(supabase: Awaited<ReturnType<typeof createClient>>): Promise<SlowQuery[] | null> {
  try {
    return await getSlowQueries(supabase, 10)
  } catch {
    return null
  }
}

function AwsMissing({ aws }: { aws: Exclude<Aws, { state: 'ok' }> }) {
  return aws.state === 'off'
    ? <p className="text-sm text-black/60">Chưa cấu hình quyền đọc AWS cho bản triển khai này (AWS_ROLE_ARN).</p>
    : <p className="text-sm text-rose-700">Không đọc được từ AWS ({aws.name}).</p>
}

export default async function AdminMonitorPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const supabase = await createClient()
  await requireAdmin(supabase)
  const range: Range = (await searchParams).range === '7d' ? '7d' : '24h'
  const readAt = new Date()
  const [aws, slow] = await Promise.all([readAws(range), readSlow(supabase)])

  return (
    <div>
      <PageHeader
        title="Giám sát"
        lead="Database và máy chủ cập nhật liên tục khi trang đang mở; lịch sử, cảnh báo và truy vấn chậm đọc lúc tải trang."
        readAt={readAt}
      />

      <Section title="Database lúc này">
        <LivePanel />
      </Section>

      <Section title="Máy chủ và container">
        <HostPanel />
      </Section>

      <Section title="Lịch sử máy chủ" aside={<RangeSwitch range={range} />}>
        {aws.state === 'ok' ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {aws.history.map((s) => <Chart key={s.id} s={s} range={range} />)}
          </div>
        ) : <AwsMissing aws={aws} />}
      </Section>

      <Section title="Truy vấn tốn nhiều thời gian nhất" aside="Cộng dồn từ lần đặt lại thống kê gần nhất">
        {slow ? <SlowQueries rows={slow} /> : <p className="text-sm text-rose-700">Không đọc được pg_stat_statements.</p>}
      </Section>

      <Section title="Cảnh báo và sao lưu">
        {aws.state === 'ok' ? <HealthPanel health={aws.health} /> : <AwsMissing aws={aws} />}
      </Section>

      <Section title="Log container">
        <LogViewer />
      </Section>
    </div>
  )
}
