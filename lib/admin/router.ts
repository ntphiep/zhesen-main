import { z } from '@/lib/zod'
import { PREFIX } from '@/lib/admin/secrets'

export const ROUTER_PARAMETERS = {
  url: `${PREFIX}/router_url`,
  password: `${PREFIX}/router_password`,
} as const

const TIMEOUT_MS = 5_000

const combosSchema = z.object({
  combos: z.array(z.object({ name: z.string(), models: z.array(z.string()) })),
})
export type Combo = z.infer<typeof combosSchema>['combos'][number]

/** Every combo in the 9router dashboard. /api/combos wants the dashboard's login cookie,
 *  which the app's API key does not give, so this signs in with the dashboard password. */
export async function readCombos(routerUrl: string, password: string): Promise<Combo[]> {
  const base = routerUrl.replace(/\/+$/, '')
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith('auth_token='))
  if (!login.ok || !cookie) throw new Error(`9router login answered ${login.status}`)
  const res = await fetch(`${base}/api/combos`, { headers: { cookie }, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`9router /api/combos answered ${res.status}`)
  return combosSchema.parse(await res.json()).combos
}
