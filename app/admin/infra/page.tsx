import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { awsHealthConfig } from '@/lib/admin/aws'
import { getCosts, type Costs } from '@/lib/admin/control'
import { PageHeader, Section, Figure } from '@/components/admin/Page'
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

function CostSection({ c }: { c: Costs | null | 'error' }) {
  if (c === null) return <p className="text-sm text-black/60">Chưa cấu hình quyền AWS cho bản triển khai này (AWS_ROLE_ARN).</p>
  if (c === 'error') return <p className="text-sm text-rose-700">Không đọc được Cost Explorer.</p>
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure label="Usage MTD" value={usd(c.usage)} note={`Since ${c.from}`} />
        <Figure label="Credits" value={usd(-c.credits)} />
        <Figure label="Net" value={usd(c.net)} />
        <Figure label="Forecast" value={c.monthUsage === null ? '–' : usd(c.monthUsage)} note="Usage, whole month" />
      </div>
      {c.byService.length > 0 && (
        <table className="mt-3 w-full rounded-lg border border-black/10 text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-black/55">
              <th className="px-4 py-2 font-medium">Service</th>
              <th className="px-4 py-2 text-right font-medium">Usage MTD</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {c.byService.map((s) => (
              <tr key={s.service}>
                <td className="px-4 py-2">{s.service}</td>
                <td className="px-4 py-2 text-right tabular-nums">{usd(s.usage)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default async function AdminInfraPage() {
  const supabase = await createClient()
  await requireAdmin(supabase)
  const costs = await readCosts()

  return (
    <div>
      <PageHeader title="Infrastructure" />
      <InfraControls />
      <Section title="Shell">
        <ShellConsole />
      </Section>
      <Section title="AWS cost" aside="Every 6 h">
        <CostSection c={costs} />
      </Section>
    </div>
  )
}
