import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseCsv, parseRestoreStatus, restoreName, restoreScript, shellScript, sqlScript } from '@/lib/admin/console'
import { secretMatches, signRescue, verifyRescue, RESCUE_TTL_MS } from '@/lib/admin/rescue'
import { BACKUP_SCRIPT, restartScript } from '@/lib/admin/control'

const { adminUser, rpc, getClaims, power, runShell, alertOwner, readRescueSecret, instanceState, jar } = vi.hoisted(() => ({
  adminUser: vi.fn(),
  rpc: vi.fn(),
  getClaims: vi.fn(),
  power: vi.fn(),
  runShell: vi.fn(),
  alertOwner: vi.fn(),
  readRescueSecret: vi.fn(),
  instanceState: vi.fn(),
  jar: new Map<string, string>(),
}))
vi.mock('@/lib/auth/admin', () => ({ adminUser }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ schema: () => ({ rpc }), auth: { getClaims } }),
}))
vi.mock('@/lib/admin/ssm', async (orig) => ({
  ...(await orig<typeof import('@/lib/admin/ssm')>()),
  clients: () => ({ ssm: {}, ec2: {}, sns: {} }),
  runShell,
  alertOwner,
  readRescueSecret,
}))
vi.mock('@/lib/admin/control', async (orig) => ({
  ...(await orig<typeof import('@/lib/admin/control')>()),
  power,
  instanceState,
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined),
    has: (k: string) => jar.has(k),
    set: (k: string, v: string) => { jar.set(k, v) },
    delete: (k: string) => { jar.delete(k) },
  }),
}))

import { POST as control } from '@/app/api/admin/control/route'
import { POST as rescue } from '@/app/api/rescue/route'

const NOW_S = Math.floor(Date.now() / 1000)
const post = (handler: (r: Request) => Promise<Response>, body: unknown) =>
  handler(new Request('http://localhost/api/x', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }))

describe('console scripts', () => {
  const nasty = `select 'it''s'; $(reboot) \`reboot\``

  it('never puts the SQL or the command on the shell line as text', () => {
    for (const script of [sqlScript('read', nasty), sqlScript('write', nasty), shellScript(nasty)]) {
      expect(script).not.toContain('reboot')
      expect(script).toContain(Buffer.from(nasty).toString('base64'))
    }
  })

  it('makes read mode read-only for every transaction and write mode not', () => {
    expect(sqlScript('read', 'select 1')).toContain('default_transaction_read_only=on')
    expect(sqlScript('write', 'select 1')).not.toContain('read_only')
  })

  it('restarts only a known container', () => {
    expect(restartScript('rest')).toContain('docker restart supabase-rest')
    // @ts-expect-error a name outside LOG_SERVICES
    expect(() => restartScript('rest; reboot')).toThrow()
  })

  it('restores only a dump key into a restore_ database', () => {
    const db = restoreName('postgres/postgres-20260924T033003Z.dump', Date.parse('2026-09-25T02:00:00Z'))
    expect(db).toBe('restore_20260924_20260925020000')
    expect(restoreScript('bucket', 'postgres/postgres-20260924T033003Z.dump', db)).toContain(`> /var/log/zhesen-${db}.log`)
    expect(() => restoreScript('bucket', '../etc/passwd', db)).toThrow()
    expect(() => restoreScript('bucket', 'postgres/postgres-20260924T033003Z.dump', 'postgres')).toThrow()
  })

  it('refuses a third restore copy and reports pg_restore exit code instead of failing on it', () => {
    const script = restoreScript('bucket', 'postgres/postgres-20260924T033003Z.dump', 'restore_x')
    const body = Buffer.from(script.match(/echo (\S+) \| base64 -d/)![1], 'base64').toString('utf8')
    expect(body).toContain('-lt 2 ]')
    expect(body).toContain('echo "restore: done $n $rc"')
  })

  it('keeps the backup script exit code through its pipe', () => {
    expect(BACKUP_SCRIPT.startsWith('set -o pipefail;')).toBe(true)
  })

  it('reads the last line of a restore log', () => {
    expect(parseRestoreStatus('pg_restore: warning\nrestore: done 36361\n')).toMatchObject({ state: 'done', entries: 36361, warnings: 0 })
    expect(parseRestoreStatus('restore: done 36361 1\n')).toMatchObject({ state: 'done', entries: 36361, warnings: 1 })
    expect(parseRestoreStatus('restore: failed 11\n').state).toBe('failed')
    expect(parseRestoreStatus('pg_restore: creating TABLE\n').state).toBe('running')
    expect(parseRestoreStatus('restore: no log\n').state).toBe('missing')
  })
})

describe('parseCsv', () => {
  it('reads psql --csv output with quotes, commas and newlines inside a cell', () => {
    expect(parseCsv('count\n36361\n')).toEqual([['count'], ['36361']])
    expect(parseCsv('a,b\n"x, ""y""","line1\nline2"\n')).toEqual([['a', 'b'], ['x, "y"', 'line1\nline2']])
  })

  it('gives up on text that is not one table, so the page shows it raw', () => {
    expect(parseCsv('UPDATE 3\na,b\n1,2\n')).toBeNull()
    expect(parseCsv('"open')).toBeNull()
    expect(parseCsv('')).toBeNull()
  })
})

describe('rescue cookie', () => {
  const secret = 'a'.repeat(64)
  const now = Date.parse('2026-09-25T02:00:00Z')

  it('accepts its own cookie for 30 minutes and no longer', () => {
    const c = signRescue(secret, now)
    expect(verifyRescue(c, secret, now + 60_000)).toBe(true)
    expect(verifyRescue(c, secret, now + RESCUE_TTL_MS + 1)).toBe(false)
  })

  it('refuses a cookie signed under another secret, a forged expiry, or garbage', () => {
    const c = signRescue(secret, now)
    expect(verifyRescue(c, 'b'.repeat(64), now)).toBe(false)
    const [, sig] = c.split('.')
    expect(verifyRescue(`${now + 10 * 60_000}.${sig}`, secret, now)).toBe(false)
    expect(verifyRescue('nope', secret, now)).toBe(false)
    expect(verifyRescue(undefined, secret, now)).toBe(false)
  })

  it('compares secrets whatever their length', () => {
    expect(secretMatches(secret, secret)).toBe(true)
    expect(secretMatches('a', secret)).toBe(false)
  })
})

describe('POST /api/admin/control', () => {
  const original = process.env.AWS_ROLE_ARN
  beforeEach(() => {
    process.env.AWS_ROLE_ARN = 'arn:aws:iam::014498663963:role/zhesen-vercel-health'
    adminUser.mockReset().mockResolvedValue({ id: 'admin', email: 'owner@example.com' })
    rpc.mockReset().mockResolvedValue({ data: null, error: null })
    getClaims.mockReset().mockResolvedValue({ data: { claims: { amr: [{ method: 'password', timestamp: NOW_S - 60 }] } }, error: null })
    power.mockReset().mockResolvedValue(undefined)
    runShell.mockReset().mockResolvedValue({ status: 'Success', exitCode: 0, stdout: 'count\n36361\n', stderr: '', truncated: false, ms: 900 })
    alertOwner.mockReset().mockResolvedValue(true)
  })
  afterEach(() => {
    if (original === undefined) delete process.env.AWS_ROLE_ARN
    else process.env.AWS_ROLE_ARN = original
  })

  it('answers 404 to a non-admin and does nothing', async () => {
    adminUser.mockResolvedValue(null)
    expect((await post(control, { action: 'power', op: 'stop', confirm: 'zhesen-supabase' })).status).toBe(404)
    expect(power).not.toHaveBeenCalled()
  })

  it('refuses an unknown action or container', async () => {
    expect((await post(control, { action: 'terminate' })).status).toBe(400)
    expect((await post(control, { action: 'restart', service: 'x', confirm: 'supabase-x' })).status).toBe(400)
  })

  it('does not stop the instance without the typed name', async () => {
    const res = await post(control, { action: 'power', op: 'stop', confirm: 'zhesen' })
    expect(res.status).toBe(409)
    expect(power).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('asks for a fresh sign-in when the last one is over 10 minutes old', async () => {
    getClaims.mockResolvedValue({ data: { claims: { amr: [{ method: 'password', timestamp: NOW_S - 601 }] } }, error: null })
    const res = await post(control, { action: 'power', op: 'stop', confirm: 'zhesen-supabase' })
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ reauth: true })
    expect(power).not.toHaveBeenCalled()
  })

  it('writes the audit row before it stops the instance, then emails', async () => {
    const order: string[] = []
    rpc.mockImplementation(async () => { order.push('audit'); return { data: null, error: null } })
    power.mockImplementation(async () => { order.push('stop') })
    alertOwner.mockImplementation(async () => { order.push('email'); return true })
    const res = await post(control, { action: 'power', op: 'stop', confirm: 'zhesen-supabase' })
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('record', { p_action: 'infra.stop', p_target: 'zhesen-supabase', p_detail: {} })
    expect(order).toEqual(['audit', 'stop', 'email'])
  })

  it('does nothing when the audit row cannot be written', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'admin only' } })
    expect((await post(control, { action: 'power', op: 'reboot', confirm: 'zhesen-supabase' })).status).toBe(502)
    expect(power).not.toHaveBeenCalled()
  })

  // Starting with the database down is /rescue's job; this route always writes the row first.
  it('does not start the instance when the audit row cannot be written', async () => {
    rpc.mockRejectedValue(new Error('fetch failed'))
    expect((await post(control, { action: 'power', op: 'start' })).status).toBe(502)
    expect(power).not.toHaveBeenCalled()
  })

  it('runs read-mode SQL after a recent sign-in without an audit row, and returns the table', async () => {
    const res = await post(control, { action: 'sql', mode: 'read', sql: 'select count(*) from lex.entries' })
    await expect(res.json()).resolves.toMatchObject({ exitCode: 0, table: [['count'], ['36361']] })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('asks for a fresh sign-in before read-mode SQL and before a restore', async () => {
    getClaims.mockResolvedValue({ data: { claims: {} }, error: null })
    const read = await post(control, { action: 'sql', mode: 'read', sql: 'select 1' })
    expect(read.status).toBe(401)
    await expect(read.json()).resolves.toMatchObject({ reauth: true })
    const restore = await post(control, { action: 'restore', key: 'postgres/postgres-20260924T033003Z.dump' })
    expect(restore.status).toBe(401)
    expect(runShell).not.toHaveBeenCalled()
  })

  it('refuses psql backslash commands, which read mode cannot hold back', async () => {
    const res = await post(control, { action: 'sql', mode: 'read', sql: 'select 1;\n  \\! reboot' })
    expect(res.status).toBe(400)
    expect(runShell).not.toHaveBeenCalled()
  })

  it('keeps the SQL text in the audit row of a write', async () => {
    await post(control, { action: 'sql', mode: 'write', sql: 'update x set y = 1', confirm: 'postgres' })
    expect(rpc).toHaveBeenCalledWith('record', { p_action: 'console.sql', p_target: 'postgres', p_detail: { sql: 'update x set y = 1' } })
  })
})

describe('POST /api/rescue', () => {
  const secret = 'c'.repeat(64)
  const original = process.env.AWS_ROLE_ARN
  afterEach(() => {
    if (original === undefined) delete process.env.AWS_ROLE_ARN
    else process.env.AWS_ROLE_ARN = original
  })
  beforeEach(() => {
    process.env.AWS_ROLE_ARN = 'arn:aws:iam::014498663963:role/zhesen-vercel-health'
    jar.clear()
    readRescueSecret.mockReset().mockResolvedValue(secret)
    instanceState.mockReset().mockResolvedValue({ state: 'stopped', type: 't4g.medium', launchedAt: null, privateDns: null })
    power.mockReset().mockResolvedValue(undefined)
    alertOwner.mockReset().mockResolvedValue(true)
  })

  it('refuses a wrong secret and sets no cookie', async () => {
    expect((await post(rescue, { op: 'unlock', secret: 'wrong' })).status).toBe(403)
    expect(jar.size).toBe(0)
  })

  it('will not start the instance without an unlocked cookie', async () => {
    expect((await post(rescue, { op: 'start' })).status).toBe(401)
    expect(power).not.toHaveBeenCalled()
  })

  it('unlocks with the secret, then starts the instance and emails both times', async () => {
    const unlocked = await post(rescue, { op: 'unlock', secret })
    expect(unlocked.status).toBe(200)
    expect(jar.get('zhesen_rescue')).toMatch(/^\d{13}\./)
    expect((await post(rescue, { op: 'start' })).status).toBe(200)
    expect(power).toHaveBeenCalledWith({}, 'start')
    expect(alertOwner).toHaveBeenCalledTimes(2)
  })
})
