import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DescribeParametersCommand, GetParameterCommand, GetParametersCommand, PutParameterCommand } from '@aws-sdk/client-ssm'

const { adminUser, rpc, getClaims, send, runShell, notify, log } = vi.hoisted(() => ({
  adminUser: vi.fn(),
  rpc: vi.fn(),
  getClaims: vi.fn(),
  send: vi.fn(),
  runShell: vi.fn(),
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
  runShell,
}))
vi.mock('@/lib/admin/guard', async (orig) => ({
  ...(await orig<typeof import('@/lib/admin/guard')>()),
  notify,
}))

import {
  INSTANCE_SERVICES, POSTGRES_ROLES, SECRETS, applyScript, buildInventory, postgresPasswordScript, rotatedKeys, signJwt,
} from '@/lib/admin/secrets'
import { GET, POST } from '@/app/api/admin/secrets/route'

const ROLE = 'arn:aws:iam::014498663963:role/zhesen-vercel-health'
const DASHBOARD = 'Dashb0ardPasswordThatMustNotLeak'
const OLD_SECRET = 'o'.repeat(40)
/** The claims shape of the production anon key. */
const OLD_ANON = signJwt({ iss: 'supabase', ref: 'cvltsyoweddhpkomuevz', role: 'anon', iat: 1781688095, exp: 2097264095 }, OLD_SECRET)

let store: Map<string, { value: string; type: string }>

const post = (body: unknown) => POST(new Request('http://localhost/api/admin/secrets', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}))

const signedInSecondsAgo = (s: number) => getClaims.mockResolvedValue({
  data: { claims: { amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - s }] } }, error: null,
})

beforeEach(() => {
  process.env.AWS_ROLE_ARN = ROLE
  log.length = 0
  store = new Map([
    ['/zhesen/prod/dashboard_password', { value: DASHBOARD, type: 'SecureString' }],
    ['/zhesen/prod/jwt_secret', { value: OLD_SECRET, type: 'SecureString' }],
    ['/zhesen/prod/anon_key', { value: OLD_ANON, type: 'String' }],
    ['/zhesen/prod/site_url', { value: 'https://zhesen-main.vercel.app', type: 'String' }],
  ])
  send.mockReset().mockImplementation(async (cmd: unknown) => {
    if (cmd instanceof GetParameterCommand) {
      const name = cmd.input.Name ?? ''
      log.push(`get ${name}`)
      const p = store.get(name)
      if (!p) throw Object.assign(new Error('not found'), { name: 'ParameterNotFound' })
      return { Parameter: { Name: name, Value: p.value } }
    }
    if (cmd instanceof GetParametersCommand) {
      const names = cmd.input.Names ?? []
      log.push(`get ${names.join(',')}`)
      return { Parameters: names.filter((n) => store.has(n)).map((n) => ({ Name: n, Value: store.get(n)?.value })) }
    }
    if (cmd instanceof DescribeParametersCommand) {
      return { Parameters: [...store].map(([Name, p]) => ({ Name, Type: p.type, Version: 1, LastModifiedDate: new Date('2026-09-23T00:00:00Z') })) }
    }
    if (cmd instanceof PutParameterCommand) {
      log.push(`put ${cmd.input.Name}`)
      store.set(cmd.input.Name ?? '', { value: cmd.input.Value ?? '', type: cmd.input.Type ?? 'String' })
      return {}
    }
    throw new Error('unexpected command')
  })
  runShell.mockReset().mockImplementation(async () => {
    log.push('shell')
    return { status: 'Success', exitCode: 0, stdout: 'ROLES_OK\n', stderr: '', truncated: false, ms: 10 }
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
  delete process.env.VERCEL_TOKEN
})

/** Which services read each variable, straight from infra/supabase/docker-compose.yml. */
function composeReaders(): Map<string, Set<string>> {
  const text = readFileSync(resolve(__dirname, '../infra/supabase/docker-compose.yml'), 'utf8')
  const readers = new Map<string, Set<string>>()
  let inServices = false
  let service: string | null = null
  for (const line of text.split('\n')) {
    if (/^\S/.test(line)) inServices = line.startsWith('services:')
    const m = inServices ? line.match(/^ {2}([\w-]+):\s*$/) : null
    if (m) service = m[1]
    if (!inServices || !service || line.trimStart().startsWith('#')) continue
    for (const ref of line.matchAll(/\$\{(\w+)/g)) {
      const set = readers.get(ref[1]) ?? new Set<string>()
      set.add(service)
      readers.set(ref[1], set)
    }
  }
  return readers
}

describe('the variable-to-service table', () => {
  it('lists every service the compose file lets read each variable, and no other', () => {
    const readers = composeReaders()
    expect(readers.get('POSTGRES_PASSWORD')?.size).toBeGreaterThan(0)
    for (const [variable, services] of Object.entries(INSTANCE_SERVICES)) {
      expect([...(readers.get(variable) ?? [])].sort(), variable).toEqual([...services].sort())
    }
  })

  it('covers every instance secret that recreates services', () => {
    for (const s of SECRETS.filter((x) => x.apply === 'instance' || x.apply === 'postgres')) {
      expect(s.variable, s.id).toBeDefined()
    }
  })

  it('renders then recreates only the listed services', () => {
    expect(applyScript(['api-gw'])).toBe('cd /opt/zhesen/supabase && ./bin/render-env.sh && docker compose up -d api-gw')
    expect(applyScript([])).toBe('cd /opt/zhesen/supabase && ./bin/render-env.sh')
  })
})

describe('rotation pieces', () => {
  it('signs new keys with the new secret and the current claims shape', () => {
    const secret = 'n'.repeat(64)
    const now = Date.UTC(2026, 8, 26)
    const { anon, serviceRole } = rotatedKeys(OLD_ANON, secret, now)
    for (const [token, role] of [[anon, 'anon'], [serviceRole, 'service_role']] as const) {
      const [h, p, s] = token.split('.')
      expect(s).toBe(createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url'))
      const iat = Math.floor(now / 1000)
      expect(JSON.parse(Buffer.from(p, 'base64url').toString())).toEqual({
        iss: 'supabase', ref: 'cvltsyoweddhpkomuevz', role, iat, exp: iat + (2097264095 - 1781688095),
      })
    }
  })

  it('changes every role in one transaction and never carries the password in the script', () => {
    const script = postgresPasswordScript(['auth'])
    const sql = Buffer.from(script.match(/echo (\S+) \| base64 -d/)?.[1] ?? '', 'base64').toString()
    for (const role of POSTGRES_ROLES) expect(sql).toContain(`alter role ${role} with password :'pw';`)
    expect(script).toContain('--single-transaction')
    expect(script).toContain('docker exec -i -e PW supabase-db')
    expect(script.indexOf('ROLES_OK')).toBeLessThan(script.indexOf('render-env.sh'))
  })
})

describe('the inventory', () => {
  it('names which home is in effect and shows no more than four characters of a secret', () => {
    const meta = new Map([
      ['/zhesen/prod/ai_api_key', { type: 'SecureString', version: 3, changedAt: '2026-09-26T00:00:00.000Z' }],
      ['/zhesen/prod/site_url', { type: 'String', version: 1, changedAt: '2026-09-23T00:00:00.000Z' }],
    ])
    const values = new Map([['/zhesen/prod/ai_api_key', 'sk-from-ssm-1234'], ['/zhesen/prod/site_url', 'https://zhesen-main.vercel.app']])
    const rows = buildInventory(meta, values, { AI_API_KEY: 'sk-from-env-9999', REVALIDATE_SECRET: 'from-env-abcd' })
    const byId = new Map(rows.map((r) => [r.id, r]))
    expect(byId.get('ai_api_key')).toMatchObject({ last4: '1234', version: 3, where: 'SSM /zhesen/prod/ai_api_key (in effect), and Vercel AI_API_KEY' })
    expect(byId.get('revalidate_secret')).toMatchObject({ last4: 'abcd', where: 'Vercel REVALIDATE_SECRET; no SSM parameter yet' })
    expect(byId.get('site_url')).toMatchObject({ group: 'Config', value: 'https://zhesen-main.vercel.app', apply: null })
    expect(byId.get('9router_dashboard_password')).toMatchObject({ revealable: false, apply: null })
    expect(JSON.stringify(rows)).not.toContain('sk-from-ssm')
  })

  it('answers 404 to a non-admin', async () => {
    adminUser.mockResolvedValue(null)
    expect((await GET()).status).toBe(404)
  })
})

describe('reveal', () => {
  it('refuses a stale sign-in before any audit row or read', async () => {
    signedInSecondsAgo(3600)
    const res = await post({ action: 'reveal', id: 'dashboard_password' })
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ reauth: true })
    expect(log).toEqual([])
  })

  it('writes the audit row before it reads the value, and keeps the value out of audit and alert', async () => {
    const res = await post({ action: 'reveal', id: 'dashboard_password' })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ value: DASHBOARD })
    expect(log).toEqual(['audit', 'get /zhesen/prod/dashboard_password'])
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(DASHBOARD)
    expect(rpc).toHaveBeenCalledWith('record', { p_action: 'secret.reveal', p_target: 'dashboard_password', p_detail: {} })
    expect(JSON.stringify(notify.mock.calls)).not.toContain(DASHBOARD)
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('reads nothing when the audit row cannot be written', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501' } })
    expect((await post({ action: 'reveal', id: 'dashboard_password' })).status).toBe(502)
    expect(log.filter((l) => l.startsWith('get'))).toEqual([])
  })
})

describe('update', () => {
  it('refuses a wrong typed name before any audit row or write', async () => {
    const res = await post({ action: 'update', id: 'dashboard_password', generate: true, confirm: 'dashboard' })
    expect(res.status).toBe(409)
    expect(log).toEqual([])
  })

  it('writes the audit row before the parameter, renders, and never records the value', async () => {
    const value = 'NewDashboardPassword0123456789'
    const res = await post({ action: 'update', id: 'dashboard_password', value, confirm: 'dashboard_password' })
    expect(res.status).toBe(200)
    expect(log).toEqual(['audit', 'put /zhesen/prod/dashboard_password', 'shell'])
    expect(store.get('/zhesen/prod/dashboard_password')).toEqual({ value, type: 'SecureString' })
    expect(runShell.mock.calls[0][1]).toBe('cd /opt/zhesen/supabase && ./bin/render-env.sh && docker compose up -d api-gw')
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(value)
    expect(JSON.stringify(notify.mock.calls)).not.toContain(value)
  })

  it('refuses a value render-env.sh would mangle', async () => {
    const res = await post({ action: 'update', id: 'dashboard_password', value: 'has&ampersand-and-more', confirm: 'dashboard_password' })
    expect(res.status).toBe(400)
    expect(log).toEqual([])
  })

  it('refuses to start a jwt_secret rotation without vercel_token, before the audit row', async () => {
    const res = await post({ action: 'update', id: 'jwt_secret', generate: true, confirm: 'jwt_secret' })
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining('vercel_token') })
    expect(log.filter((l) => l === 'audit' || l.startsWith('put'))).toEqual([])
  })

  it('refuses a key derived from jwt_secret', async () => {
    expect((await post({ action: 'update', id: 'anon_key', value: 'x', confirm: 'anon_key' })).status).toBe(409)
    expect(log).toEqual([])
  })

  it('puts the old postgres password back when the database refuses the new one', async () => {
    store.set('/zhesen/prod/postgres_password', { value: 'OldPostgresPassword0123456789', type: 'SecureString' })
    runShell.mockResolvedValue({ status: 'Failed', exitCode: 1, stdout: '', stderr: 'ERROR: role "x" does not exist', truncated: false, ms: 10 })
    const res = await post({ action: 'update', id: 'postgres_password', generate: true, confirm: 'postgres_password' })
    expect(res.status).toBe(502)
    expect(store.get('/zhesen/prod/postgres_password')?.value).toBe('OldPostgresPassword0123456789')
  })
})
