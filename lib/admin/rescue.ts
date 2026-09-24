import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

/**
 * The rescue entry (#64). Stopping EC2 stops Postgres and GoTrue, so the admin sign-in
 * cannot reach /admin to start it again. /rescue checks a secret kept in SSM
 * (`RESCUE_PARAMETER`), never calls Supabase, and allows only reading the instance state
 * and starting it.
 *
 * The cookie is `<expiry ms>.<HMAC-SHA256 of the expiry under the secret>`: rotating the
 * parameter voids every cookie at once.
 */

export const RESCUE_COOKIE = 'zhesen_rescue'
export const RESCUE_TTL_MS = 30 * 60_000

const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest()

/** Constant-time over the digests, so neither length nor prefix leaks through timing. */
export function secretMatches(given: string, secret: string): boolean {
  return timingSafeEqual(digest(given), digest(secret))
}

const mac = (secret: string, expiry: number) => createHmac('sha256', secret).update(`rescue:${expiry}`).digest('base64url')

export function signRescue(secret: string, now: number = Date.now()): string {
  const expiry = now + RESCUE_TTL_MS
  return `${expiry}.${mac(secret, expiry)}`
}

export function verifyRescue(cookie: string | undefined, secret: string, now: number = Date.now()): boolean {
  const m = cookie?.match(/^(\d{13})\.([\w-]{43})$/)
  if (!m) return false
  const expiry = Number(m[1])
  if (expiry <= now || expiry > now + RESCUE_TTL_MS) return false
  return timingSafeEqual(Buffer.from(m[2]), Buffer.from(mac(secret, expiry)))
}
