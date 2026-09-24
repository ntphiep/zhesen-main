import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { getMetrics, type Metrics } from '@/lib/admin/metrics'
import { integrations } from '@/lib/admin/cache'
import { awsHealthConfig, getHealth } from '@/lib/admin/aws'
import { deployment, edgeHost, probeAuth } from '@/lib/admin/architecture'
import { PageHeader, Section, ago } from '@/components/admin/Page'
import { ArchitectureMap, DataPlaces, VersionTable, versionRows, type Live, type MapState } from '@/components/admin/ArchitectureMap'
import { dumpTone } from '@/components/admin/Overview'

export const metadata = { title: 'Kiến trúc · Quản trị' }

/** admin.metrics() travels CloudFront, Envoy, PostgREST and Postgres, so its answer is the
 *  database's live state. Timed here rather than inside the RPC to include the whole path. */
async function timedMetrics(supabase: Awaited<ReturnType<typeof createClient>>): Promise<{ m: Metrics | null; ms: number; error: string | null }> {
  const started = performance.now()
  try {
    const m = await getMetrics(supabase)
    return { m, ms: Math.round(performance.now() - started), error: null }
  } catch (e) {
    return { m: null, ms: Math.round(performance.now() - started), error: e instanceof Error ? e.name : 'Error' }
  }
}

async function awsLive(): Promise<{ backups: Live; alarms: Live; bucket: string | null }> {
  const cfg = awsHealthConfig()
  if (!cfg) {
    const off: Live = { tone: 'idle', text: 'Chưa cấu hình quyền đọc AWS' }
    return { backups: off, alarms: off, bucket: null }
  }
  const bucket = `zhesen-db-backups-${cfg.accountId}`
  try {
    const h = await getHealth(cfg)
    const firing = h.alarms.filter((a) => a.state === 'ALARM').length
    return {
      bucket,
      backups: { tone: dumpTone(h.dump), text: h.dump ? `Bản gần nhất ${ago(h.dump.at)}` : 'Chưa có bản dump nào' },
      alarms: {
        tone: firing > 0 ? 'bad' : 'ok',
        text: firing > 0 ? `${firing} cảnh báo đang báo` : `${h.alarms.length} cảnh báo, không cái nào đang báo`,
      },
    }
  } catch (e) {
    const failed: Live = { tone: 'idle', text: `Không đọc được AWS (${e instanceof Error ? e.name : 'Error'})` }
    return { bucket, backups: failed, alarms: failed }
  }
}

export default async function AdminArchitecturePage() {
  const supabase = await createClient()
  await requireAdmin(supabase)
  const readAt = new Date()
  const [auth, db, aws] = await Promise.all([probeAuth(), timedMetrics(supabase), awsLive()])

  const state: MapState = {
    edgeHost: edgeHost(),
    deployment: deployment(),
    auth: {
      tone: auth.ok ? 'ok' : 'bad',
      text: auth.ok ? `Trả lời sau ${auth.ms} ms` : `Không trả lời (${auth.detail})`,
      version: auth.ok ? auth.detail.replace(/^GoTrue\s*/, '') || null : null,
    },
    database: db.m
      ? { tone: 'ok', text: `Trả lời sau ${db.ms} ms`, version: db.m.postgres.version }
      : { tone: 'bad', text: `Không trả lời (${db.error})`, version: null },
    ...aws,
    integrations: integrations(),
  }

  return (
    <div>
      <PageHeader
        title="Kiến trúc"
        lead="Đường đi của một request từ trình duyệt tới database, nơi từng phần chạy, và trạng thái trang này vừa đo được ở mỗi chặng."
        readAt={readAt}
      />
      <div className="mt-6"><ArchitectureMap s={state} /></div>
      <Section title="Dữ liệu nằm ở đâu">
        <DataPlaces bucket={state.bucket} />
      </Section>
      <Section title="Phiên bản">
        <VersionTable rows={versionRows(state)} />
      </Section>
    </div>
  )
}
