import { createClient } from '@/lib/supabase/server'
import { adminUser } from '@/lib/auth/admin'
import { awsHealthConfig } from '@/lib/admin/aws'
import { clients, runShell } from '@/lib/admin/ssm'
import { getLiveRow, HOST_SCRIPT, LOG_SERVICES, logScript, parseHost, parseLogs } from '@/lib/admin/monitor'
import { readContainerSeries, readHost } from '@/lib/admin/host'
import { badRequest, notFoundJson } from '@/lib/admin/respond'

const NO_STORE = { 'Cache-Control': 'no-store' }

/** What /admin/monitor polls: `live` (Postgres, every 10 s), `host` (the instance), `containers`
 *  (the same snapshot plus the last hour per container) and `logs` (one container's last 15
 *  minutes, on demand). `host` and `containers` read the sampler's 5 s rows and fall back to
 *  one SSM command when those are stale or missing. `containers&hour=0` leaves out the hour,
 *  580 kB of the 590 kB answer, and carries the host's newest point instead. */
export async function GET(request: Request): Promise<Response> {
  const supabase = await createClient()
  if (!(await adminUser(supabase))) return notFoundJson()
  const url = new URL(request.url)
  const part = url.searchParams.get('part')

  if (part === 'live') {
    try {
      return Response.json(await getLiveRow(supabase), { headers: NO_STORE })
    } catch {
      return Response.json({ error: 'Could not read metrics from the database.' }, { status: 502, headers: NO_STORE })
    }
  }

  if (part !== 'host' && part !== 'containers' && part !== 'logs') return badRequest()
  const service = url.searchParams.get('service')
  if (part === 'logs' && !LOG_SERVICES.some((s) => s === service)) return badRequest()

  if (part !== 'logs') {
    const hourly = part === 'containers' && url.searchParams.get('hour') !== '0'
    // A failed read (migration not applied, sampler never ran) is the same as a stale one.
    const [host, hour] = await Promise.all([
      readHost(supabase).catch(() => null),
      hourly ? readContainerSeries(supabase).catch(() => null) : null,
    ])
    if (host && part === 'host') return Response.json(host, { headers: NO_STORE })
    if (host) {
      const newest = { t: host.at, cpu: host.cpuPercent, mem: host.memory?.used ?? null }
      return Response.json({
        at: host.at, source: host.source, containers: host.containers,
        series: hour?.series ?? [], host: hourly ? hour?.host ?? [] : [newest],
      }, { headers: NO_STORE })
    }
  }

  const cfg = awsHealthConfig()
  if (!cfg) return Response.json({ enabled: false }, { headers: NO_STORE })
  try {
    const { ssm } = clients(cfg)
    const out = await runShell(ssm, part === 'logs' ? logScript(service ?? '') : HOST_SCRIPT, 20)
    if (out.status !== 'Success') {
      return Response.json({ error: `Command on the instance finished with status ${out.status}.` }, { status: 502, headers: NO_STORE })
    }
    const at = new Date().toISOString()
    if (part === 'logs') return Response.json({ at, service, ...parseLogs(out.stdout) }, { headers: NO_STORE })
    const snap = parseHost(out.stdout)
    if (part === 'host') return Response.json({ at, ...snap }, { headers: NO_STORE })
    return Response.json({ at, source: snap.source, containers: snap.containers, series: [], host: [] }, { headers: NO_STORE })
  } catch (e) {
    // The error name (AccessDenied, InvalidInstanceId) says what to fix; the message can carry ARNs.
    const name = e instanceof Error ? e.name : 'Error'
    return Response.json({ error: `Could not call SSM (${name}).` }, { status: 502, headers: NO_STORE })
  }
}
