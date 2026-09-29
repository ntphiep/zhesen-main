import { z } from '@/lib/zod'
import { PREFIX } from '@/lib/admin/secrets'

/** The two routers on /admin/router: 9router answers the assistant, OmniRoute when it fails. */
export const ROUTERS = [
  { name: '9router', url: `${PREFIX}/router_url`, password: `${PREFIX}/router_password` },
  { name: 'OmniRoute', url: `${PREFIX}/omniroute_url`, password: `${PREFIX}/omniroute_password` },
] as const

export type RouterName = (typeof ROUTERS)[number]['name']

const TIMEOUT_MS = 5_000

/** 9router lists a combo's models as ids, OmniRoute as objects carrying the id in `model`. */
const combosSchema = z.object({
  combos: z.array(z.object({
    name: z.string(),
    models: z.array(z.union([z.string(), z.object({ model: z.string() }).transform((m) => m.model)])),
  })),
})
export type Combo = z.infer<typeof combosSchema>['combos'][number]

/** Every combo in a router's dashboard. /api/combos wants the dashboard's login cookie,
 *  which the app's API key does not give, so this signs in with the dashboard password.
 *  Both routers share the login route and the auth_token cookie. */
export async function readCombos(routerUrl: string, password: string, name: RouterName = '9router'): Promise<Combo[]> {
  const base = routerUrl.replace(/\/+$/, '')
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith('auth_token='))
  if (!login.ok || !cookie) throw new Error(`${name} login answered ${login.status}`)
  const res = await fetch(`${base}/api/combos`, { headers: { cookie }, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`${name} /api/combos answered ${res.status}`)
  return combosSchema.parse(await res.json()).combos
}
