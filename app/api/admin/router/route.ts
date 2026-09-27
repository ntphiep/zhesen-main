import { createClient } from '@/lib/supabase/server'
import { adminUser } from '@/lib/auth/admin'
import { z } from '@/lib/zod'
import { awsHealthConfig } from '@/lib/admin/aws'
import { clients } from '@/lib/admin/ssm'
import { checkGuard, notify, record } from '@/lib/admin/guard'
import { badRequest, notFoundJson, readJson } from '@/lib/admin/respond'
import { readValues } from '@/lib/admin/secrets'
import { gateLink, LINK_SECONDS, ROUTER_PARAMETERS } from '@/lib/admin/router'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE })

/** A link into the 9router dashboard and its password, behind the same guard as a reveal
 *  on /admin/secrets: the dashboard shows every provider login and key. */
export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient()
  const user = await adminUser(supabase)
  if (!user) return notFoundJson()
  if (!z.object({}).safeParse(await readJson(request)).success) return badRequest()

  const cfg = awsHealthConfig()
  if (!cfg) return json({ error: 'AWS access is not configured for this deployment (AWS_ROLE_ARN).' }, 503)
  const refusal = await checkGuard(supabase, undefined, null)
  if (refusal) return json(refusal.body, refusal.status)
  try {
    await record(supabase, 'console.router_open', 'router_password', {})
  } catch {
    return json({ error: 'Could not write the audit log, so nothing was shown.' }, 502)
  }

  let values: Map<string, string>
  try {
    values = await readValues(clients(cfg).ssm, Object.values(ROUTER_PARAMETERS))
  } catch (e) {
    return json({ error: `AWS refused or did not answer (${e instanceof Error ? e.name : 'Error'}).` }, 502)
  }
  const missing = Object.values(ROUTER_PARAMETERS).filter((n) => !values.get(n))
  if (missing.length) return json({ error: `Not set in SSM: ${missing.join(', ')}.` }, 404)

  await notify(cfg, user, 'console.router_open', ['Opened the 9router dashboard.'])
  return json({
    link: gateLink(values.get(ROUTER_PARAMETERS.url) ?? '', values.get(ROUTER_PARAMETERS.key) ?? ''),
    password: values.get(ROUTER_PARAMETERS.password),
    expiresIn: LINK_SECONDS,
  })
}
