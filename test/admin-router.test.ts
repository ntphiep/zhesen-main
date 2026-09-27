import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { GetParametersCommand } from '@aws-sdk/client-ssm'

const { adminUser, rpc, getClaims, send, notify, log } = vi.hoisted(() => ({
  adminUser: vi.fn(),
  rpc: vi.fn(),
  getClaims: vi.fn(),
  send: vi.fn(),
  notify: vi.fn(),
  log: [] as string[],
}))
vi.mock('@/lib/auth/admin', () => ({ adminUser }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ schema: () => ({ rpc }), auth: { getClaims } }),
}))
vi.mock('@/lib/admin/ssm', async (orig) => ({
  ...(await orig<typeof import('@/lib/admin/ssm')>()),
  clients: () => ({ ssm: { send }, ec2: {}, sns: {} }),
}))
vi.mock('@/lib/admin/guard', async (orig) => ({
  ...(await orig<typeof import('@/lib/admin/guard')>()),
  notify,
}))

import { gateLink, LINK_SECONDS } from '@/lib/admin/router'
import { POST } from '@/app/api/admin/router/route'

const KEY = 'k'.repeat(48)
const ROUTER = 'https://d1router.cloudfront.net'
const PASSWORD = 'RouterPasswordThatOnlyTheGuardShows'
const T = Date.UTC(2026, 8, 27, 12)

interface GateRequest { uri: string; querystring: Record<string, { value: string }>; cookies: Record<string, { value: string }> }
interface GateResponse { statusCode: number; headers: Record<string, { value: string }>; cookies?: Record<string, { value: string; attributes: string }> }
type Handler = (event: { request: GateRequest }) => GateRequest | GateResponse

/** The CloudFront function as Terraform renders it, run on Node's crypto. */
function gate(key: string): Handler {
  const source = readFileSync(resolve(__dirname, '../infra/terraform/modules/edge/router-gate.js'), 'utf8').replace('${key}', key)
  return new Function('require', `${source}\nreturn handler`)((m: string) => (m === 'crypto' ? crypto : undefined)) as Handler
}

const at = (ms: number) => vi.setSystemTime(ms)
const request = (uri: string, extra: Partial<GateRequest> = {}): GateRequest => ({ uri, querystring: {}, cookies: {}, ...extra })
const token = (link: string) => new URL(link).searchParams.get('t') ?? ''
const trade = (handler: Handler, link: string) => handler({ request: request('/__gate', { querystring: { t: { value: token(link) } } }) }) as GateResponse

describe('the 9router gate', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('trades a fresh link for a cookie that admits the dashboard for 12 hours', () => {
    const handler = gate(KEY)
    const link = gateLink(ROUTER, KEY, T)
    expect(link.startsWith(`${ROUTER}/__gate?t=`)).toBe(true)
    at(T + 60_000)
    const res = trade(handler, link)
    expect(res.statusCode).toBe(302)
    expect(res.headers.location.value).toBe('/dashboard')
    const cookie = res.cookies?.zhesen_gate
    expect(cookie?.attributes).toContain('Secure')
    expect(cookie?.attributes).toContain('HttpOnly')
    const inside = request('/api/providers', { cookies: { zhesen_gate: { value: cookie?.value ?? '' } } })
    at(T + 60_000 + 11 * 3600_000)
    expect(handler({ request: inside })).toBe(inside)
    at(T + 60_000 + 12 * 3600_000 + 1000)
    expect((handler({ request: inside }) as GateResponse).statusCode).toBe(403)
  })

  it('refuses an expired link, a link signed with another key, and a link used as the cookie', () => {
    const handler = gate(KEY)
    const link = gateLink(ROUTER, KEY, T)
    at(T + (LINK_SECONDS + 1) * 1000)
    expect(trade(handler, link).statusCode).toBe(403)
    at(T)
    expect(trade(handler, gateLink(ROUTER, 'x'.repeat(48), T)).statusCode).toBe(403)
    const [exp, sig] = token(link).split('.')
    expect(trade(handler, `${ROUTER}/__gate?t=${Number(exp) + 3600}.${sig}`).statusCode).toBe(403)
    const asCookie = request('/dashboard', { cookies: { zhesen_gate: { value: token(link) } } })
    expect((handler({ request: asCookie }) as GateResponse).statusCode).toBe(403)
  })

  it('refuses every path without the cookie', () => {
    const handler = gate(KEY)
    for (const uri of ['/', '/dashboard', '/login', '/api/auth/login', '/v1/models', '/__gate']) {
      expect((handler({ request: request(uri) }) as GateResponse).statusCode, uri).toBe(403)
    }
  })
})

describe('POST /api/admin/router', () => {
  let store: Map<string, string>
  const post = (body: unknown = {}) => POST(new Request('http://localhost/api/admin/router', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }))
  const signedInSecondsAgo = (s: number) => getClaims.mockResolvedValue({
    data: { claims: { amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - s }] } }, error: null,
  })

  beforeEach(() => {
    process.env.AWS_ROLE_ARN = 'arn:aws:iam::014498663963:role/zhesen-vercel-health'
    log.length = 0
    store = new Map([
      ['/zhesen/prod/router_url', ROUTER],
      ['/zhesen/prod/router_gate_key', KEY],
      ['/zhesen/prod/router_password', PASSWORD],
    ])
    send.mockReset().mockImplementation(async (cmd: unknown) => {
      if (!(cmd instanceof GetParametersCommand)) throw new Error('unexpected command')
      log.push('get')
      const names = cmd.input.Names ?? []
      return { Parameters: names.filter((n) => store.has(n)).map((n) => ({ Name: n, Value: store.get(n) })) }
    })
    notify.mockReset().mockResolvedValue(true)
    adminUser.mockReset().mockResolvedValue({ id: 'admin', email: 'owner@example.com' })
    rpc.mockReset().mockImplementation(async () => {
      log.push('audit')
      return { data: null, error: null }
    })
    signedInSecondsAgo(60)
  })
  afterEach(() => {
    delete process.env.AWS_ROLE_ARN
  })

  it('answers 404 to a non-admin', async () => {
    adminUser.mockResolvedValue(null)
    expect((await post()).status).toBe(404)
  })

  it('asks for a fresh sign-in before any audit row or read', async () => {
    signedInSecondsAgo(3600)
    const res = await post()
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ reauth: true })
    expect(log).toEqual([])
  })

  it('shows nothing when the audit row cannot be written', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'denied' } })
    const res = await post()
    expect(res.status).toBe(502)
    expect(JSON.stringify(await res.json())).not.toContain(PASSWORD)
    expect(send).not.toHaveBeenCalled()
  })

  it('records, then returns the password and a link the gate accepts', async () => {
    const res = await post()
    expect(res.status).toBe(200)
    const body = await res.json() as { link: string; password: string; expiresIn: number }
    expect(log).toEqual(['audit', 'get'])
    expect(rpc).toHaveBeenCalledWith('record', { p_action: 'console.router_open', p_target: 'router_password', p_detail: {} })
    expect(body.password).toBe(PASSWORD)
    expect(body.expiresIn).toBe(LINK_SECONDS)
    expect(notify).toHaveBeenCalledOnce()
    vi.useFakeTimers()
    at(Date.now())
    expect(trade(gate(KEY), body.link).statusCode).toBe(302)
    vi.useRealTimers()
  })

  it('names the parameter that is missing', async () => {
    store.delete('/zhesen/prod/router_gate_key')
    const res = await post()
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Not set in SSM: /zhesen/prod/router_gate_key.' })
  })
})
