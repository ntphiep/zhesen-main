import Link from 'next/link'
import { Suspense } from 'react'
import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { getMetrics, type Metrics } from '@/lib/admin/metrics'
import { listAudit } from '@/lib/admin/audit'
import { integrations } from '@/lib/admin/cache'
import { shared } from '@/lib/admin/shared'
import { awsHealthConfig, getHealth } from '@/lib/admin/aws'
import { getCosts } from '@/lib/admin/control'
import { deployment, edgeHost, probeAuth } from '@/lib/admin/architecture'
import { Loading, PageHeader, ReadFailed, Section, ago } from '@/components/admin/Page'
import { Kpis, SystemStrip, VacuumNote, dumpTone, systemChecks, type AwsView } from '@/components/admin/Overview'
import { ArchitectureMap, DataPlaces, VersionTable, versionRows, type Live, type MapState } from '@/components/admin/ArchitectureMap'
import { OperationsPanel } from '@/components/admin/OperationsPanel'
import { AuditLog } from '@/components/admin/AuditLog'

/** Same key as app/admin/infra/page.tsx, so both pages share one Cost Explorer read. */
const cachedCosts = unstable_cache(async () => {
  const cfg = awsHealthConfig()
  return cfg ? getCosts(cfg) : null
}, ['admin-costs'], { revalidate: 21_600 })

/** admin.metrics() counts every row of every table: 2.5 to 2.9 s on production on
 *  2026-10-04, and past the 8 s statement timeout when three admin pages ran at once. */
const sharedMetrics = shared<Metrics>(300_000)

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

/** The audit read travels CloudFront, Envoy, PostgREST and Postgres on every request, so its
 *  round trip is the database's live state even when the metrics are a shared read. */
async function timedAudit(supabase: Awaited<ReturnType<typeof createClient>>) {
  const started = performance.now()
  const audit = await listAudit(supabase, 5)
  return { audit, ms: Math.round(performance.now() - started) }
}

function awsLive(aws: AwsView): { backups: Live; alarms: Live } {
  if (aws.state !== 'ok') {
    const off: Live = { tone: 'idle', text: aws.state === 'off' ? 'Not configured' : `Unreadable (${aws.name})` }
    return { backups: off, alarms: off }
  }
  const firing = aws.alarms.filter((a) => a.state === 'ALARM').length
  return {
    backups: { tone: dumpTone(aws.dump), text: aws.dump ? `Last dump ${ago(aws.dump.at)}` : 'No dump yet' },
    alarms: { tone: firing > 0 ? 'bad' : 'ok', text: firing > 0 ? `${firing} firing` : `${aws.alarms.length} alarms OK` },
  }
}

function CacheSection() {
  return (
    <Section title="Cache">
      <OperationsPanel />
    </Section>
  )
}

/** Everything that waits on the database or AWS, streamed after the page shell. */
async function OverviewBody() {
  const supabase = await createClient()
  const [db, [auth, aws, costs, links]] = await Promise.all([
    Promise.all([sharedMetrics(() => getMetrics(supabase)), timedAudit(supabase)])
      .catch((e: unknown): { failed: unknown } => ({ failed: e })),
    Promise.all([probeAuth(), readAws(), cachedCosts().catch(() => null), integrations()]),
  ])
  if ('failed' in db) {
    return (
      <>
        <PageHeader title="Overview" />
        <div className="mt-6"><ReadFailed what="the database" error={db.failed} /></div>
        <CacheSection />
      </>
    )
  }
  const [{ value: m, at: readAt }, { audit, ms }] = db
  const disk = aws.state === 'ok' ? aws.alarms.find((a) => a.metric === 'disk_used_percent')?.latest ?? null : null
  const cfg = awsHealthConfig()

  const map: MapState = {
    edgeHost: edgeHost(),
    deployment: deployment(),
    auth: {
      tone: auth.ok ? 'ok' : 'bad',
      text: auth.ok ? `${auth.ms} ms` : `No answer (${auth.detail})`,
      version: auth.ok ? auth.detail.replace(/^GoTrue\s*/, '') || null : null,
    },
    database: { tone: 'ok', text: `${ms} ms`, version: m.postgres.version },
    ...awsLive(aws),
    integrations: links,
    bucket: cfg ? `zhesen-db-backups-${cfg.accountId}` : null,
  }

  return (
    <>
      <PageHeader title="Overview" readAt={readAt} />
      <SystemStrip checks={systemChecks(m, auth, aws)} />
      <Kpis m={m} diskPercent={disk} costMtd={costs?.usage ?? null} />
      <VacuumNote m={m} />
      <Section title="Architecture">
        <ArchitectureMap s={map} />
      </Section>
      <div className="grid gap-x-6 lg:grid-cols-2">
        <Section title="Stack"><VersionTable rows={versionRows(map)} /></Section>
        <Section title="Where the data lives"><DataPlaces bucket={map.bucket} /></Section>
      </div>
      <CacheSection />
      <Section title="Recent actions" aside={<Link href="/admin/audit" prefetch={false} className="hover:underline">Audit log</Link>}>
        <AuditLog entries={audit} />
      </Section>
    </>
  )
}

export default async function AdminPage() {
  const supabase = await createClient()
  await requireAdmin(supabase)
  return (
    <div>
      <Suspense fallback={<><PageHeader title="Overview" /><div className="mt-6"><Loading /></div></>}>
        <OverviewBody />
      </Suspense>
    </div>
  )
}
