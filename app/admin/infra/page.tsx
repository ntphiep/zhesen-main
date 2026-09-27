import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { awsHealthConfig } from '@/lib/admin/aws'
import { getCosts, type Costs } from '@/lib/admin/control'
import { costsByService, serviceFacts, SERVICES, type ServiceFacts, type ServiceId } from '@/lib/admin/services'
import { edgeHost, probeAuth } from '@/lib/admin/architecture'
import { formatBytes } from '@/lib/admin/metrics'
import { ago, PageHeader, Section, Figure } from '@/components/admin/Page'
import { AlertSettings } from '@/components/admin/AlertSettings'
import { InfraControls } from '@/components/admin/InfraControls'
import { ShellConsole } from '@/components/admin/Console'

export const metadata = { title: 'Infrastructure · Admin' }

/** Cost Explorer charges per request and refreshes about once a day, so six hours. */
const cachedCosts = unstable_cache(async (): Promise<Costs | null> => {
  const cfg = awsHealthConfig()
  return cfg ? getCosts(cfg) : null
}, ['admin-costs'], { revalidate: 21_600 })

async function readCosts(): Promise<Costs | null | 'error'> {
  try {
    return await cachedCosts()
  } catch {
    return 'error'
  }
}

const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** infra/terraform/variables.tf `budget_usd`. */
const BUDGET_USD = 45

function CostSection({ c }: { c: Costs | null | 'error' }) {
  if (c === null) return <p className="text-sm text-black/60">AWS access is not configured for this deployment (AWS_ROLE_ARN).</p>
  if (c === 'error') return <p className="text-sm text-rose-700">Cost Explorer could not be read.</p>
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Figure label="Usage MTD" value={usd(c.usage)} note={`Since ${c.from}`} />
      <Figure label="Credits" value={usd(-c.credits)} />
      <Figure label="Net" value={usd(c.net)} />
      <Figure label="Forecast" value={c.monthUsage === null ? '–' : usd(c.monthUsage)} note={`Usage, whole month · budget ${usd(BUDGET_USD)}`} />
    </div>
  )
}

function details(f: ServiceFacts | null, edge: { host: string; ms: number | null }): Record<ServiceId, string> {
  const s3 = f?.s3
  const sns = f?.sns
  return {
    ec2: 'zhesen-supabase, details above',
    s3: s3 ? [`${s3.bucket}`, `${s3.dumps} dumps · ${formatBytes(s3.bytes)}`, s3.newest ? `newest ${ago(s3.newest)}` : null, s3.retainDays ? `kept ${s3.retainDays} d` : null].filter(Boolean).join(' · ') : '–',
    cloudfront: `${edge.host}${edge.ms === null ? '' : ` · ${edge.ms} ms`}`,
    vpc: 'Public IPv4 for outbound traffic; inbound only from CloudFront, on port 80 and 9router\'s 20128',
    cloudwatch: f?.cloudwatch ? `${f.cloudwatch.alarms} alarms · ${f.cloudwatch.firing === 0 ? 'none firing' : `${f.cloudwatch.firing} firing`}` : '–',
    sns: sns ? `${sns.topic} · ${sns.subscriptions.length === 0 ? 'no subscribers' : sns.subscriptions.map((x) => `${x.protocol}${x.pending ? ' (pending)' : ''}`).join(', ')}` : '–',
    ssm: f?.ssm ? `${f.ssm.parameters} parameters under /zhesen/` : '–',
    budgets: `${usd(BUDGET_USD)} a month · alert at 80% spent and 100% forecast`,
    ce: 'Read every 6 h',
    iam: f?.iam.role ?? '–',
  }
}

function ServicesTable({ c, f, edge }: { c: Costs | null | 'error'; f: ServiceFacts | null; edge: { host: string; ms: number | null } }) {
  const costs = c && c !== 'error' ? costsByService(c.byService) : null
  const d = details(f, edge)
  const cell = 'px-4 py-2 align-top'
  return (
    <div className="overflow-x-auto rounded-lg border border-black/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-black/10 text-left text-xs text-black/55">
            <th className={`${cell} font-medium`}>Service</th>
            <th className={`${cell} font-medium`}>Now</th>
            <th className={`${cell} text-right font-medium`}>MTD</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {SERVICES.map((s) => (
            <tr key={s.id}>
              <td className={cell}>
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-black/55">{s.role}</div>
              </td>
              <td className={`${cell} wrap-anywhere text-black/70`}>{d[s.id]}</td>
              <td className={`${cell} text-right tabular-nums`}>{costs ? usd(costs.rows.get(s.id) ?? 0) : '–'}</td>
            </tr>
          ))}
          {costs?.other.map((o) => (
            <tr key={o.service} className="text-black/50">
              <td className={cell}>{o.service}</td>
              <td className={cell}>Elsewhere in the account, not zhesen</td>
              <td className={`${cell} text-right tabular-nums`}>{usd(o.usage)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default async function AdminInfraPage() {
  const supabase = await createClient()
  await requireAdmin(supabase)
  const cfg = awsHealthConfig()
  const [costs, facts, probe] = await Promise.all([
    readCosts(),
    cfg ? serviceFacts(cfg).catch(() => null) : Promise.resolve(null),
    probeAuth(),
  ])
  const edge = { host: edgeHost(), ms: probe.ok ? probe.ms : null }

  return (
    <div>
      <PageHeader title="Infrastructure" />
      <InfraControls />
      <Section title="Shell">
        <ShellConsole />
      </Section>
      <Section title="AWS services">
        <ServicesTable c={costs} f={facts} edge={edge} />
      </Section>
      <Section title="AWS cost" aside="Every 6 h">
        <CostSection c={costs} />
      </Section>
      <Section title="Alerts">
        <AlertSettings />
      </Section>
    </div>
  )
}
