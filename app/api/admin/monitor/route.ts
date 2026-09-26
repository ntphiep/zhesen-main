import { createClient } from '@/lib/supabase/server'
import { adminUser } from '@/lib/auth/admin'
import { awsHealthConfig } from '@/lib/admin/aws'
import { clients, runShell } from '@/lib/admin/ssm'
import { getLiveRow, HOST_SCRIPT, LOG_SERVICES, logScript, parseHost, parseLogs } from '@/lib/admin/monitor'
import { badRequest, notFoundJson } from '@/lib/admin/respond'

const NO_STORE = { 'Cache-Control': 'no-store' }

/** What /admin/monitor polls: `live` (Postgres, every 10 s), `host` (the instance and its
 *  containers, every 30 s) and `logs` (one container's last 15 minutes, on demand). */
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

  if (part !== 'host' && part !== 'logs') return badRequest()
  const service = url.searchParams.get('service')
  if (part === 'logs' && !LOG_SERVICES.some((s) => s === service)) return badRequest()

  const cfg = awsHealthConfig()
  if (!cfg) return Response.json({ enabled: false }, { headers: NO_STORE })
  try {
    const { ssm } = clients(cfg)
    const out = await runShell(ssm, part === 'host' ? HOST_SCRIPT : logScript(service ?? ''), 20)
    if (out.status !== 'Success') {
      return Response.json({ error: `Command on the instance finished with status ${out.status}.` }, { status: 502, headers: NO_STORE })
    }
    const at = new Date().toISOString()
    if (part === 'host') return Response.json({ at, ...parseHost(out.stdout) }, { headers: NO_STORE })
    return Response.json({ at, service, ...parseLogs(out.stdout) }, { headers: NO_STORE })
  } catch (e) {
    // The error name (AccessDenied, InvalidInstanceId) says what to fix; the message can carry ARNs.
    const name = e instanceof Error ? e.name : 'Error'
    return Response.json({ error: `Could not call SSM (${name}).` }, { status: 502, headers: NO_STORE })
  }
}
