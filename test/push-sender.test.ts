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

/** PostgREST answers the four RPCs; each push endpoint answers by its last path segment. */
function fakeFetch(due: unknown, rpcStatus: Partial<Record<string, number>> = {}, claimed: (user: string) => boolean = () => true) {
  const calls: { url: string; headers: Record<string, string>; body: unknown }[] = []
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const headers = Object.fromEntries(new Headers(init?.headers).entries())
    const rpc = /\/rpc\/(\w+)$/.exec(url)?.[1]
    const body: unknown = rpc ? JSON.parse(String(init?.body)) : init?.body
    calls.push({ url, headers, body })
    if (rpc) {
      const status = rpcStatus[rpc] ?? 200
      if (status !== 200) return new Response('boom', { status })
      const user = typeof body === 'object' && body !== null && 'p_user_id' in body ? String(body.p_user_id) : ''
      const answer = rpc === 'reminders_due' ? due : rpc === 'reminders_claim' ? claimed(user) : rpc === 'reminders_release' ? true : 1
      return new Response(JSON.stringify(answer), { status })
    }
    const answer = url.split('/').pop()
    if (answer === 'timeout') throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    return new Response('', { status: Number(answer), headers: answer === '429' ? { 'Retry-After': '3600' } : {} })
  })
  return { impl, calls }
}

async function runWith(due: unknown, rpcStatus?: Partial<Record<string, number>>, claimed?: (user: string) => boolean) {
  const { impl, calls } = fakeFetch(due, rpcStatus, claimed)
  const log = vi.fn()
  const vapid = await testVapid()
  const options: RunOptions = {
    fetch: impl, restUrl: 'http://rest:3000', serviceKey: 'service-key', vapid, now: NOW, log,
  }
  return { options, calls, log, result: () => run(options) }
}

const rpcBodies = (calls: { url: string; body: unknown }[], name: string) =>
  calls.filter((c) => c.url.endsWith(`/rpc/${name}`)).map((c) => c.body)
const AT = '2026-10-05T13:30:00.000Z'
/** Each call in order, an RPC by its name and a push by its URL. */
const order = (calls: { url: string }[]) => calls.map((c) => c.url.replace('http://rest:3000/rpc/', ''))

describe('run', () => {
  it('claims the user before the first push, and sends the headers the push services read', async () => {
    const { calls, result } = await runWith([
      { user_id: ids.a, due: 7, subscriptions: [sub(ids.s1, 'https://fcm.googleapis.com/fcm/send/201')] },
    ])
    expect(await result()).toEqual({ users: 1, sent: 1, gone: 0, failed: 0 })
    expect(order(calls)).toEqual(['reminders_due', 'reminders_claim', 'https://fcm.googleapis.com/fcm/send/201'])

    const due = calls[0]
    expect(due.headers).toMatchObject({ 'content-profile': 'admin', apikey: 'service-key', authorization: 'Bearer service-key' })
    expect(due.body).toEqual({ p_now: AT })
    expect(calls[1].body).toEqual({ p_user_id: ids.a, p_now: AT })

    const push = calls[2]
    expect(push.headers).toMatchObject({
      ttl: '14400', urgency: 'normal', topic: 'review',
      'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream',
    })
    expect(push.headers.authorization).toMatch(/^vapid t=.+, k=/)
  })

  it('sends nothing to a user another run already claimed today', async () => {
    const { calls, result } = await runWith([
      { user_id: ids.a, due: 2, subscriptions: [sub(ids.s1, 'https://fcm.googleapis.com/fcm/send/201')] },
    ], {}, () => false)
    expect(await result()).toEqual({ users: 0, sent: 0, gone: 0, failed: 0 })
    expect(order(calls)).toEqual(['reminders_due', 'reminders_claim'])
  })

  it('throws before any push when the claim fails, so a failure never sends twice', async () => {
    const { calls, result } = await runWith([
      { user_id: ids.a, due: 2, subscriptions: [sub(ids.s1, 'https://fcm.googleapis.com/fcm/send/201')] },
    ], { reminders_claim: 500 })
    await expect(result()).rejects.toThrow('rpc reminders_claim: HTTP 500')
    expect(order(calls)).toEqual(['reminders_due', 'reminders_claim'])
  })

  it.each(['403', '404', '410'])('drops a subscription the service answers %s for, and gives the day back', async (answer) => {
    const { calls, result } = await runWith([
      { user_id: ids.a, due: 2, subscriptions: [sub(ids.s1, `https://fcm.googleapis.com/fcm/send/${answer}`)] },
    ])
    expect(await result()).toEqual({ users: 0, sent: 0, gone: 1, failed: 0 })
    expect(rpcBodies(calls, 'reminders_release')).toEqual([{ p_user_id: ids.a, p_now: AT }])
    expect(rpcBodies(calls, 'push_subscriptions_gone')).toEqual([{ p_ids: [ids.s1] }])
  })

  it.each(['500', 'timeout'])('gives the day back on a %s for the next hour, with one log line', async (answer) => {
    const { calls, log, result } = await runWith([
      { user_id: ids.a, due: 2, subscriptions: [sub(ids.s1, `https://fcm.googleapis.com/fcm/send/${answer}`)] },
    ])
    expect(await result()).toEqual({ users: 0, sent: 0, gone: 0, failed: 1 })
    expect(rpcBodies(calls, 'reminders_release')).toEqual([{ p_user_id: ids.a, p_now: AT }])
    expect(rpcBodies(calls, 'push_subscriptions_gone')).toEqual([])
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0][0]).toContain(ids.s1)
  })

  it('stops pushing to a service that answers 429 for the rest of the run, and logs its Retry-After', async () => {
    const { calls, log, result } = await runWith([
      { user_id: ids.a, due: 2, subscriptions: [sub(ids.s1, 'https://fcm.googleapis.com/fcm/send/429')] },
      { user_id: ids.b, due: 5, subscriptions: [
        sub(ids.s2, 'https://fcm.googleapis.com/fcm/send/201'), sub(ids.s3, 'https://web.push.apple.com/201'),
      ] },
    ])
    expect(await result()).toEqual({ users: 1, sent: 1, gone: 0, failed: 2 })
    expect(calls.some((c) => c.url === 'https://fcm.googleapis.com/fcm/send/201')).toBe(false)
    expect(calls.some((c) => c.url === 'https://web.push.apple.com/201')).toBe(true)
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0][0]).toContain('Retry-After 3600')
    expect(rpcBodies(calls, 'reminders_release')).toEqual([{ p_user_id: ids.a, p_now: AT }])
  })

  it('keeps the claim when one of several browsers is reached', async () => {
    const { calls, result } = await runWith([
      { user_id: ids.a, due: 2, subscriptions: [
        sub(ids.s1, 'https://fcm.googleapis.com/fcm/send/410'), sub(ids.s2, 'https://fcm.googleapis.com/fcm/send/201'),
      ] },
      { user_id: ids.b, due: 5, subscriptions: [sub(ids.s3, 'https://fcm.googleapis.com/fcm/send/500')] },
    ])
    expect(await result()).toEqual({ users: 1, sent: 1, gone: 1, failed: 1 })
    expect(rpcBodies(calls, 'reminders_release')).toEqual([{ p_user_id: ids.b, p_now: AT }])
    expect(rpcBodies(calls, 'push_subscriptions_gone')).toEqual([{ p_ids: [ids.s1] }])
  })

  it('logs a failed release and goes on to the next user', async () => {
    const { log, result } = await runWith([
      { user_id: ids.a, due: 2, subscriptions: [sub(ids.s1, 'https://fcm.googleapis.com/fcm/send/500')] },
      { user_id: ids.b, due: 5, subscriptions: [sub(ids.s2, 'https://fcm.googleapis.com/fcm/send/201')] },
    ], { reminders_release: 500 })
    expect(await result()).toEqual({ users: 1, sent: 1, gone: 0, failed: 1 })
    expect(log.mock.calls.map((c) => c[0]).join('\n')).toContain(`release ${ids.a}: rpc reminders_release: HTTP 500`)
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
    const body = calls[2].body
    expect(body).toBeInstanceOf(Uint8Array)
    expect(body instanceof Uint8Array && body.length).toBe(86 + '{"due":7}'.length + 1 + 16)
  })

  it('throws on a malformed row before sending anything', async () => {
    const { calls, result } = await runWith([{ user_id: ids.a, due: 'many', subscriptions: [] }])
    await expect(result()).rejects.toThrow(/reminders_due/)
    expect(calls).toHaveLength(1)
  })

  it.each(['reminders_due', 'push_subscriptions_gone'])('throws when %s fails', async (name) => {
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
