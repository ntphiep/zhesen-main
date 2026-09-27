import { createHmac } from 'node:crypto'
import { PREFIX } from '@/lib/admin/secrets'

/**
 * The link /admin/router hands out to the 9router dashboard. The gate function on its
 * CloudFront distribution (infra/terraform/modules/edge/router-gate.js) checks the same
 * HMAC; test/admin-router.test.ts runs one against the other.
 */

export const ROUTER_PARAMETERS = {
  url: `${PREFIX}/router_url`,
  key: `${PREFIX}/router_gate_key`,
  password: `${PREFIX}/router_password`,
} as const

/** How long the gate function accepts a link before it must be traded for its cookie. */
export const LINK_SECONDS = 300

export function gateLink(routerUrl: string, key: string, now: number = Date.now()): string {
  const exp = Math.floor(now / 1000) + LINK_SECONDS
  const sig = createHmac('sha256', key).update(`link:${exp}`).digest('hex')
  return `${routerUrl.replace(/\/+$/, '')}/__gate?t=${exp}.${sig}`
}
