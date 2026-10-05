import { describe, it, expect, vi } from 'vitest'
import {
  encrypt, fromB64u, importEc, parseDueRows, run, toB64u, vapidAuth, type RunOptions,
} from '@/infra/supabase/push/sender.mjs'

const utf8 = new TextEncoder()

// RFC 8291, section 5 and Appendix A.
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  body:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
    'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
    'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
}

const NOW = Date.parse('2026-10-05T13:30:00Z')

async function testVapid() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  return { publicKey: toB64u(raw), privateKey: jwk.d ?? '', subject: 'https://zhesen.example', verifyKey: pair.publicKey }
}

const ids = {
  a: '00000000-0000-4000-8000-0000000000a1',
  b: '00000000-0000-4000-8000-0000000000b2',
  s1: '10000000-0000-4000-8000-000000000001',
  s2: '10000000-0000-4000-8000-000000000002',
  s3: '10000000-0000-4000-8000-000000000003',
}
const sub = (id: string, endpoint: string) => ({ id, endpoint, p256dh: RFC.uaPublic, auth: RFC.auth })

describe('encrypt', () => {
  it('matches RFC 8291 Appendix A byte for byte', async () => {
    const keys = await importEc(RFC.asPublic, RFC.asPrivate, 'ECDH')
    const body = await encrypt(utf8.encode(RFC.plaintext), { p256dh: RFC.uaPublic, auth: RFC.auth }, {
      salt: fromB64u(RFC.salt), keys,
    })
    expect(toB64u(body)).toBe(RFC.body)
  })

  it('draws a fresh salt and key for every push', async () => {
    const to = { p256dh: RFC.uaPublic, auth: RFC.auth }
    const [one, two] = await Promise.all([encrypt(utf8.encode('{"due":3}'), to), encrypt(utf8.encode('{"due":3}'), to)])
    // 86-byte header, the payload, its 0x02 delimiter and the 16-byte tag.
    expect(one.length).toBe(86 + 9 + 1 + 16)
    expect(toB64u(one.subarray(0, 16))).not.toBe(toB64u(two.subarray(0, 16)))
    expect(toB64u(one.subarray(21, 86))).not.toBe(toB64u(two.subarray(21, 86)))
  })
})

describe('vapidAuth', () => {
  it('signs a JWT for the push service origin that verifies with the public key', async () => {
    const vapid = await testVapid()
    const header = await vapidAuth('https://fcm.googleapis.com/fcm/send/abc', vapid, NOW)
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)
    expect(match).not.toBeNull()
    const [, head, claims, signature, k] = match ?? []
    expect(k).toBe(vapid.publicKey)
    expect(JSON.parse(Buffer.from(head, 'base64url').toString())).toEqual({ typ: 'JWT', alg: 'ES256' })
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toEqual({
      aud: 'https://fcm.googleapis.com', exp: NOW / 1000 + 12 * 3600, sub: 'https://zhesen.example',
    })
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, vapid.verifyKey, fromB64u(signature), utf8.encode(`${head}.${claims}`),
    )
    expect(ok).toBe(true)
  })
})

describe('parseDueRows', () => {
  const good = { user_id: ids.a, due: 3, subscriptions: [sub(ids.s1, 'https://fcm.googleapis.com/fcm/send/x')] }

  it('maps a row to camelCase', () => {
    expect(parseDueRows([good])).toEqual([{ userId: ids.a, due: 3, subscriptions: [good.subscriptions[0]] }])
  })

  it.each([
    ['not an array', { rows: [] }],
    ['a row that is not an object', [null]],
    ['a missing user id', [{ ...good, user_id: undefined }]],
    ['a user id that is not a uuid', [{ ...good, user_id: 'abc' }]],
    ['a due count of 0', [{ ...good, due: 0 }]],
    ['a fractional due count', [{ ...good, due: 1.5 }]],
    ['a due count sent as text', [{ ...good, due: '3' }]],
    ['no subscriptions', [{ ...good, subscriptions: [] }]],
    ['a null subscription list', [{ ...good, subscriptions: null }]],
    ['an http endpoint', [{ ...good, subscriptions: [sub(ids.s1, 'http://fcm.googleapis.com/x')] }]],
    ['a short key', [{ ...good, subscriptions: [{ ...good.subscriptions[0], p256dh: 'abc' }] }]],
    ['a short auth secret', [{ ...good, subscriptions: [{ ...good.subscriptions[0], auth: 'abc' }] }]],
  ])('throws on %s', (_, data) => {
    expect(() => parseDueRows(data)).toThrow(/reminders_due/)
  })
})

/** PostgREST answers the three RPCs; each push endpoint answers by its last path segment. */
function fakeFetch(due: unknown, rpcStatus: Partial<Record<string, number>> = {}) {
  const calls: { url: string; headers: Record<string, string>; body: unknown }[] = []
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const headers = Object.fromEntries(new Headers(init?.headers).entries())
    const rpc = /\/rpc\/(\w+)$/.exec(url)?.[1]
    calls.push({ url, headers, body: rpc ? JSON.parse(String(init?.body)) : init?.body })
    if (rpc) {
      const status = rpcStatus[rpc] ?? 200
      return new Response(status === 200 ? JSON.stringify(rpc === 'reminders_due' ? due : 1) : 'boom', { status })
    }
    const answer = url.split('/').pop()
    if (answer === 'timeout') throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    return new Response('', { status: Number(answer) })
  })
  return { impl, calls }
}

async function runWith(due: unknown, rpcStatus?: Partial<Record<string, number>>) {
  const { impl, calls } = fakeFetch(due, rpcStatus)
  const log = vi.fn()
  const vapid = await testVapid()
  const options: RunOptions = {
    fetch: impl, restUrl: 'http://rest:3000', serviceKey: 'service-key', vapid, now: NOW, log,
  }
  return { options, calls, log, result: () => run(options) }
}

const rpcBody = (calls: { url: string; body: unknown }[], name: string) =>
  calls.find((c) => c.url.endsWith(`/rpc/${name}`))?.body

describe('run', () => {
  it('stamps a user once one push lands, and sends the headers the push services read', async () => {
    const { calls, result } = await runWith([
      { user_id: ids.a, due: 7, subscriptions: [sub(ids.s1, 'https://fcm.googleapis.com/fcm/send/201')] },
    ])
    expect(await result()).toEqual({ users: 1, sent: 1, gone: 0, failed: 0 })

    const due = calls[0]
    expect(due.url).toBe('http://rest:3000/rpc/reminders_due')
    expect(due.headers).toMatchObject({ 'content-profile': 'admin', apikey: 'service-key', authorization: 'Bearer service-key' })
    expect(due.body).toEqual({ p_now: '2026-10-05T13:30:00.000Z' })

    const push = calls[1]
    expect(push.url).toBe('https://fcm.googleapis.com/fcm/send/201')
    expect(push.headers).toMatchObject({
      ttl: '14400', urgency: 'normal', topic: 'review',
      'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream',
    })
    expect(push.headers.authorization).toMatch(/^vapid t=.+, k=/)
    expect(rpcBody(calls, 'reminders_sent')).toEqual({ p_user_ids: [ids.a], p_now: '2026-10-05T13:30:00.000Z' })
    expect(rpcBody(calls, 'push_subscriptions_gone')).toBeUndefined()
  })

  it('drops a subscription the service answers 404 or 410 for, without stamping', async () => {
    const { calls, result } = await runWith([
      { user_id: ids.a, due: 2, subscriptions: [
        sub(ids.s1, 'https://fcm.googleapis.com/fcm/send/404'), sub(ids.s2, 'https://web.push.apple.com/410'),
      ] },
    ])
    expect(await result()).toEqual({ users: 0, sent: 0, gone: 2, failed: 0 })
    expect(rpcBody(calls, 'push_subscriptions_gone')).toEqual({ p_ids: [ids.s1, ids.s2] })
    expect(rpcBody(calls, 'reminders_sent')).toBeUndefined()
  })

  it.each(['429', '500', 'timeout'])('leaves a %s for the next hour: no stamp, no delete, one log line', async (answer) => {
    const { calls, log, result } = await runWith([
      { user_id: ids.a, due: 2, subscriptions: [sub(ids.s1, `https://fcm.googleapis.com/fcm/send/${answer}`)] },
    ])
    expect(await result()).toEqual({ users: 0, sent: 0, gone: 0, failed: 1 })
    expect(rpcBody(calls, 'reminders_sent')).toBeUndefined()
    expect(rpcBody(calls, 'push_subscriptions_gone')).toBeUndefined()
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0][0]).toContain(ids.s1)
  })

  it('stamps a user when one of several browsers is reached', async () => {
    const { calls, result } = await runWith([
      { user_id: ids.a, due: 2, subscriptions: [
        sub(ids.s1, 'https://fcm.googleapis.com/fcm/send/410'), sub(ids.s2, 'https://fcm.googleapis.com/fcm/send/201'),
      ] },
      { user_id: ids.b, due: 5, subscriptions: [sub(ids.s3, 'https://fcm.googleapis.com/fcm/send/500')] },
    ])
    expect(await result()).toEqual({ users: 1, sent: 1, gone: 1, failed: 1 })
    expect(rpcBody(calls, 'reminders_sent')).toEqual({ p_user_ids: [ids.a], p_now: '2026-10-05T13:30:00.000Z' })
    expect(rpcBody(calls, 'push_subscriptions_gone')).toEqual({ p_ids: [ids.s1] })
  })

  it('signs one JWT per push service for the whole run', async () => {
    const { calls, result } = await runWith([
      { user_id: ids.a, due: 2, subscriptions: [
        sub(ids.s1, 'https://fcm.googleapis.com/fcm/send/201'), sub(ids.s2, 'https://web.push.apple.com/201'),
      ] },
      { user_id: ids.b, due: 5, subscriptions: [sub(ids.s3, 'https://fcm.googleapis.com/fcm/send/201')] },
    ])
    await result()
    const auth = (url: string) => calls.filter((c) => c.url === url).map((c) => c.headers.authorization)
    const [fcm1, fcm2] = auth('https://fcm.googleapis.com/fcm/send/201')
    // ES256 signatures are randomised, so equal headers mean the token was reused.
    expect(fcm1).toBe(fcm2)
    expect(auth('https://web.push.apple.com/201')[0]).not.toBe(fcm1)
  })

  it('sends the session count as the payload, encrypted', async () => {
    const { calls, result } = await runWith([
      { user_id: ids.a, due: 7, subscriptions: [sub(ids.s1, 'https://fcm.googleapis.com/fcm/send/201')] },
    ])
    await result()
    const body = calls[1].body
    expect(body).toBeInstanceOf(Uint8Array)
    expect(body instanceof Uint8Array && body.length).toBe(86 + '{"due":7}'.length + 1 + 16)
  })

  it('throws on a malformed row before sending anything', async () => {
    const { calls, result } = await runWith([{ user_id: ids.a, due: 'many', subscriptions: [] }])
    await expect(result()).rejects.toThrow(/reminders_due/)
    expect(calls).toHaveLength(1)
  })

  it.each(['reminders_due', 'reminders_sent', 'push_subscriptions_gone'])('throws when %s fails', async (name) => {
    const { result } = await runWith([
      { user_id: ids.a, due: 2, subscriptions: [
        sub(ids.s1, 'https://fcm.googleapis.com/fcm/send/201'), sub(ids.s2, 'https://fcm.googleapis.com/fcm/send/410'),
      ] },
    ], { [name]: 500 })
    await expect(result()).rejects.toThrow(`rpc ${name}: HTTP 500`)
  })

  it('does nothing when nobody is due', async () => {
    const { calls, result } = await runWith([])
    expect(await result()).toEqual({ users: 0, sent: 0, gone: 0, failed: 0 })
    expect(calls).toHaveLength(1)
  })
})
