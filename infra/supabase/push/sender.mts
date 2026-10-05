// The daily review reminder (issue #91), run hourly by systemd as `docker compose run push`.
// Plain Node 24 with type stripping and WebCrypto: the container has no node_modules.
// Encryption is RFC 8291 (aes128gcm), authentication RFC 8292 (VAPID, ES256).
import { pathToFileURL } from 'node:url'

type Bytes = Uint8Array<ArrayBuffer>

export interface Subscription { id: string; endpoint: string; p256dh: string; auth: string }
export interface DueRow { userId: string; due: number; subscriptions: Subscription[] }
/** Both keys base64url: the 65-byte public point and the 32-byte private scalar. */
export interface Vapid { publicKey: string; privateKey: string; subject: string }

const TIMEOUT_MS = 10_000
/** A reminder older than four hours is no longer today's evening. */
const TTL_SECONDS = 14_400
const JWT_SECONDS = 12 * 3600
const RECORD_SIZE = 4096

const utf8 = new TextEncoder()

export const toB64u = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url')
export const fromB64u = (text: string): Bytes => new Uint8Array(Buffer.from(text, 'base64url'))

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}

/** A P-256 key pair from its base64url public point and private scalar. */
export async function importEc(publicKey: string, privateKey: string, name: 'ECDH' | 'ECDSA'): Promise<CryptoKeyPair> {
  const point = fromB64u(publicKey)
  if (point.length !== 65 || point[0] !== 4) throw new Error('public key is not an uncompressed P-256 point')
  const jwk = { kty: 'EC', crv: 'P-256', x: toB64u(point.subarray(1, 33)), y: toB64u(point.subarray(33)) }
  const algorithm = { name, namedCurve: 'P-256' }
  const [pub, priv] = await Promise.all([
    crypto.subtle.importKey('jwk', jwk, algorithm, true, name === 'ECDSA' ? ['verify'] : []),
    crypto.subtle.importKey('jwk', { ...jwk, d: privateKey }, algorithm, false, name === 'ECDSA' ? ['sign'] : ['deriveBits']),
  ])
  return { publicKey: pub, privateKey: priv }
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, bytes: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8))
}

/** One aes128gcm record for the browser's keys. `fixed` pins the salt and the sender's key
 *  pair, which only the RFC 8291 test vector does; every real push draws fresh ones. */
export async function encrypt(
  payload: Uint8Array, to: Pick<Subscription, 'p256dh' | 'auth'>, fixed?: { salt: Bytes; keys: CryptoKeyPair },
): Promise<Bytes> {
  const uaPublic = fromB64u(to.p256dh)
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const keys = fixed?.keys ?? await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey))
  const ua = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: ua }, keys.privateKey, 256))

  const ikm = await hkdf(fromB64u(to.auth), ecdh, concat(utf8.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const cek = await hkdf(salt, ikm, utf8.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, utf8.encode('Content-Encoding: nonce\0'), 12)
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  // 0x02 closes the last (and only) record.
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, Uint8Array.of(2))))

  const header = new Uint8Array(21)
  header.set(salt)
  new DataView(header.buffer).setUint32(16, RECORD_SIZE)
  header[20] = asPublic.length
  return concat(header, asPublic, sealed)
}

/** The Authorization header for one push service: a JWT for its origin, signed ES256. */
export async function vapidAuth(endpoint: string, vapid: Vapid, now: number): Promise<string> {
  const part = (value: object) => toB64u(utf8.encode(JSON.stringify(value)))
  const head = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({
    aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + JWT_SECONDS, sub: vapid.subject,
  })}`
  const { privateKey } = await importEc(vapid.publicKey, vapid.privateKey, 'ECDSA')
  // WebCrypto signs as r || s, the form JWS wants (RFC 7518 section 3.4).
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, utf8.encode(head))
  return `vapid t=${head}.${toB64u(new Uint8Array(signature))}, k=${vapid.publicKey}`
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function field(value: unknown, test: RegExp, what: string): string {
  if (typeof value !== 'string' || !test.test(value)) throw new Error(`reminders_due: bad ${what}`)
  return value
}

/** admin.reminders_due's rows. Hand-written in place of Zod, which this container lacks. */
export function parseDueRows(data: unknown): DueRow[] {
  if (!Array.isArray(data)) throw new Error('reminders_due: not an array')
  return data.map((row: unknown) => {
    if (!isRecord(row)) throw new Error('reminders_due: row is not an object')
    const { due, subscriptions } = row
    if (typeof due !== 'number' || !Number.isInteger(due) || due < 1) throw new Error('reminders_due: bad due')
    if (!Array.isArray(subscriptions) || subscriptions.length === 0) throw new Error('reminders_due: bad subscriptions')
    return {
      userId: field(row.user_id, UUID, 'user_id'),
      due,
      subscriptions: subscriptions.map((s: unknown) => {
        if (!isRecord(s)) throw new Error('reminders_due: subscription is not an object')
        return {
          id: field(s.id, UUID, 'subscription id'),
          endpoint: field(s.endpoint, /^https:\/\/[^/]+\//, 'endpoint'),
          p256dh: field(s.p256dh, /^[A-Za-z0-9_-]{87}$/, 'p256dh'),
          auth: field(s.auth, /^[A-Za-z0-9_-]{22}$/, 'auth'),
        }
      }),
    }
  })
}

export interface RunOptions {
  fetch: typeof fetch
  /** PostgREST inside the compose network. */
  restUrl: string
  serviceKey: string
  vapid: Vapid
  now: number
  log: (line: string) => void
}

export interface RunResult { users: number; sent: number; gone: number; failed: number }

/** A push service's answer that the subscription will never work again: dropped by the
 *  browser (404, 410), or made for a VAPID key this deployment no longer holds (403). */
const GONE = new Set([403, 404, 410])

/** One hourly pass. Each user is claimed for the local day before the first push and given
 *  back only when no browser was reached, so nothing reminds a learner twice in one day.
 *  A 429 stops pushes to that service for the run. A failed RPC throws, so the unit exits 1. */
export async function run(o: RunOptions): Promise<RunResult> {
  const rpc = async (name: string, body: object): Promise<unknown> => {
    const res = await o.fetch(`${o.restUrl}/rpc/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'Content-Profile': 'admin',
        apikey: o.serviceKey, Authorization: `Bearer ${o.serviceKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`rpc ${name}: HTTP ${res.status} ${text.slice(0, 300)}`)
    return JSON.parse(text)
  }

  const at = new Date(o.now).toISOString()
  const rows = parseDueRows(await rpc('reminders_due', { p_now: at }))
  // One JWT per push service per run.
  const tokens = new Map<string, Promise<string>>()
  // Push services that answered 429 get nothing more this run.
  const throttled = new Set<string>()
  const gone: string[] = []
  let users = 0
  let sent = 0
  let failed = 0

  for (const row of rows) {
    if ((await rpc('reminders_claim', { p_user_id: row.userId, p_now: at })) !== true) continue
    const payload = utf8.encode(JSON.stringify({ due: row.due }))
    let reached = false
    for (const sub of row.subscriptions) {
      const origin = new URL(sub.endpoint).origin
      if (throttled.has(origin)) { failed++; continue }
      let token = tokens.get(origin)
      if (!token) { token = vapidAuth(sub.endpoint, o.vapid, o.now); tokens.set(origin, token) }
      try {
        const res = await o.fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            Authorization: await token, 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
            TTL: String(TTL_SECONDS), Urgency: 'normal', Topic: 'review',
          },
          body: await encrypt(payload, sub),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        const text = await res.text()
        if (res.ok) { reached = true; sent++ }
        else if (GONE.has(res.status)) gone.push(sub.id)
        else {
          failed++
          if (res.status === 429) throttled.add(origin)
          const wait = res.status === 429 ? `, Retry-After ${res.headers.get('retry-after') ?? 'unset'}, paused for this run` : ''
          o.log(`push ${origin} ${sub.id}: HTTP ${res.status}${wait} ${text.slice(0, 200)}`)
        }
      } catch (e) {
        failed++
        o.log(`push ${origin} ${sub.id}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (reached) users++
    else {
      // A failed release only costs this learner today's reminder, never a second one.
      try {
        await rpc('reminders_release', { p_user_id: row.userId, p_now: at })
      } catch (e) {
        o.log(`release ${row.userId}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  if (gone.length) await rpc('push_subscriptions_gone', { p_ids: gone })
  return { users, sent, gone: gone.length, failed }
}

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not set`)
  return value
}

async function main(): Promise<void> {
  const result = await run({
    fetch,
    restUrl: process.env.REST_URL?.trim() || 'http://rest:3000',
    serviceKey: required('SERVICE_ROLE_KEY'),
    vapid: { publicKey: required('VAPID_PUBLIC_KEY'), privateKey: required('VAPID_PRIVATE_KEY'), subject: required('VAPID_SUBJECT') },
    now: Date.now(),
    log: (line) => console.log(line),
  })
  console.log(`reminded ${result.users} users: ${result.sent} sent, ${result.gone} gone, ${result.failed} failed`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e: unknown) => {
    console.error(e)
    process.exitCode = 1
  })
}
