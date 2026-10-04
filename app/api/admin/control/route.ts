import type { User } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { adminUser } from '@/lib/auth/admin'
import { z } from '@/lib/zod'
import { awsHealthConfig, type AwsHealthConfig } from '@/lib/admin/aws'
import { clients, runShell, type ShellResult } from '@/lib/admin/ssm'
import { LOG_SERVICES } from '@/lib/admin/monitor'
import {
  BACKUP_SCRIPT, INSTANCE_NAME, INSTANCE_TYPES, instanceState, power, resize, restartScript, typeOptions, typePrices,
} from '@/lib/admin/control'
import {
  DUMP_KEY, parseCsv, parseRestoreStatus, restoreName, restoreScript, restoreStatusScript, shellScript, sqlScript,
} from '@/lib/admin/console'
import { checkGuard, notify, record } from '@/lib/admin/guard'
import { clearShared } from '@/lib/admin/shared'
import { badRequest, notFoundJson, readJson } from '@/lib/admin/respond'

/** A backup or a long shell command runs up to 240 s; the audit row and email come around it. */
export const maxDuration = 300

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE })

/** What each typed confirmation must equal. */
const DATABASE_NAME = 'postgres'

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('power'), op: z.enum(['start', 'stop', 'reboot']), confirm: z.string().optional() }),
  z.object({ action: z.literal('restart'), service: z.enum(LOG_SERVICES), confirm: z.string() }),
  z.object({ action: z.literal('resize'), type: z.enum(INSTANCE_TYPES), confirm: z.string().optional() }),
  z.object({ action: z.literal('backup') }),
  z.object({ action: z.literal('sql'), mode: z.enum(['read', 'write']), sql: z.string().min(1).max(20_000), confirm: z.string().optional() }),
  z.object({ action: z.literal('shell'), command: z.string().min(1).max(10_000), confirm: z.string(), timeout: z.number().int().min(5).max(240).default(60) }),
  z.object({ action: z.literal('restore'), key: z.string().regex(DUMP_KEY) }),
])

type Body = z.infer<typeof body>

function awsFailure(e: unknown): Response {
  // The error name (AccessDenied, IncorrectInstanceState) says what to fix; the message can carry ARNs.
  const name = e instanceof Error ? e.name : 'Error'
  return json({ error: `AWS refused or did not respond (${name}).` }, 502)
}

const shellBody = (r: ShellResult) => ({
  status: r.status, exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr, truncated: r.truncated, ms: r.ms,
})

/** Prices change a few times a year; a failed read throws and is not kept. */
const cachedPrices = unstable_cache(async (cfg: AwsHealthConfig) => typePrices(cfg), ['admin-ec2-prices'], { revalidate: 86_400 })

/** Instance state for the console's polling, the type catalogue, and a restore's progress. */
export async function GET(request: Request): Promise<Response> {
  const supabase = await createClient()
  if (!(await adminUser(supabase))) return notFoundJson()
  const cfg = awsHealthConfig()
  if (!cfg) return json({ enabled: false })
  const url = new URL(request.url)
  try {
    const { ec2, ssm } = clients(cfg)
    if (url.searchParams.get('part') === 'state') return json(await instanceState(ec2))
    if (url.searchParams.get('part') === 'types') return json(await typeOptions(ec2, await cachedPrices(cfg).catch(() => null)))
    const db = url.searchParams.get('restore')
    if (db && /^restore_\w+$/.test(db)) {
      const out = await runShell(ssm, restoreStatusScript(db), 20)
      return json({ db, ...parseRestoreStatus(out.stdout) })
    }
    return badRequest()
  } catch (e) {
    return awsFailure(e)
  }
}

/** Which actions need a recent sign-in, and the name each must have typed (null: none).
 *  Read-mode SQL runs as supabase_admin and can read every row, so a stale session may
 *  not use it either. */
function guardOf(b: Body): { target: string | null } | null {
  if (b.action === 'power') return b.op === 'start' ? null : { target: INSTANCE_NAME }
  if (b.action === 'resize') return { target: INSTANCE_NAME }
  if (b.action === 'restart') return { target: `supabase-${b.service}` }
  if (b.action === 'sql') return { target: b.mode === 'write' ? DATABASE_NAME : null }
  if (b.action === 'shell') return { target: INSTANCE_NAME }
  if (b.action === 'restore') return { target: null }
  return null
}

/** psql runs its own backslash commands from stdin, `\!` among them: a shell in the
 *  database container that no audit row would describe. The shell box is the way to that. */
const PSQL_META = /^\s*\\/m

function auditOf(b: Body, from: string | null): { action: string; target: string; detail: Record<string, unknown> } | null {
  switch (b.action) {
    case 'power': return { action: `infra.${b.op}`, target: INSTANCE_NAME, detail: {} }
    case 'resize': return { action: 'infra.resize', target: INSTANCE_NAME, detail: { from, to: b.type } }
    case 'restart': return { action: 'infra.restart', target: `supabase-${b.service}`, detail: {} }
    case 'backup': return { action: 'infra.backup', target: INSTANCE_NAME, detail: {} }
    case 'sql': return b.mode === 'write' ? { action: 'console.sql', target: DATABASE_NAME, detail: { sql: b.sql } } : null
    case 'shell': return { action: 'console.shell', target: INSTANCE_NAME, detail: { command: b.command, timeout: b.timeout } }
    case 'restore': return { action: 'console.restore', target: b.key, detail: {} }
  }
}

async function act(cfg: AwsHealthConfig, b: Body, from: string | null): Promise<{ result: Record<string, unknown>; summary: string[] }> {
  const { ec2, ssm } = clients(cfg)
  switch (b.action) {
    case 'power': {
      await power(ec2, b.op)
      return { result: { requested: b.op }, summary: [`EC2 ${b.op} requested for ${INSTANCE_NAME}.`] }
    }
    case 'resize': {
      const ms = await resize(ec2, b.type, from)
      return { result: { from, to: b.type, ms }, summary: [`Changed ${INSTANCE_NAME} from ${from} to ${b.type} in ${Math.round(ms / 1000)} s.`] }
    }
    case 'restart': {
      const r = await runShell(ssm, restartScript(b.service), 90)
      return { result: shellBody(r), summary: [`Restarted supabase-${b.service}: ${r.status}, started ${r.stdout.trim()}.`] }
    }
    case 'backup': {
      const r = await runShell(ssm, BACKUP_SCRIPT, 240)
      return { result: shellBody(r), summary: [`Backup run: ${r.status}.`, r.stdout.trim()] }
    }
    case 'sql': {
      const r = await runShell(ssm, sqlScript(b.mode, b.sql), b.mode === 'read' ? 45 : 150)
      return { result: { ...shellBody(r), table: r.exitCode === 0 ? parseCsv(r.stdout) : null }, summary: [`SQL (${b.mode}): ${r.status}, exit ${r.exitCode}.`, b.sql] }
    }
    case 'shell': {
      const r = await runShell(ssm, shellScript(b.command), b.timeout)
      return { result: shellBody(r), summary: [`Shell: ${r.status}, exit ${r.exitCode}.`, b.command] }
    }
    case 'restore': {
      const db = restoreName(b.key)
      const bucket = `zhesen-db-backups-${cfg.accountId}`
      const r = await runShell(ssm, restoreScript(bucket, b.key, db), 30)
      return { result: { ...shellBody(r), db }, summary: [`Restore of ${b.key} into ${db} started: ${r.status}.`] }
    }
  }
}

/** Only the actions that change or read the server beyond its metrics email the owner. */
const EMAILED = new Set(['power', 'resize', 'restart', 'backup', 'shell', 'restore'])

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient()
  const user: User | null = await adminUser(supabase)
  if (!user) return notFoundJson()
  const parsed = body.safeParse(await readJson(request))
  if (!parsed.success) return badRequest()
  const b = parsed.data

  const cfg = awsHealthConfig()
  if (!cfg) return json({ error: 'AWS access is not configured for this deployment (AWS_ROLE_ARN).' }, 503)

  if (b.action === 'sql' && PSQL_META.test(b.sql)) {
    return json({ error: 'A psql command starting with \\ does not run here; use the shell box.' }, 400)
  }

  const guard = guardOf(b)
  if (guard) {
    const refusal = await checkGuard(supabase, 'confirm' in b ? b.confirm : undefined, guard.target)
    if (refusal) return json(refusal.body, refusal.status)
  }

  // Read before the audit row, so a change to the type it already has records nothing.
  let from: string | null = null
  if (b.action === 'resize') {
    try {
      from = (await instanceState(clients(cfg).ec2)).type
    } catch (e) {
      return awsFailure(e)
    }
    if (from === b.type) return json({ error: `Instance is already ${b.type}.` }, 409)
  }

  // With the database down adminUser has already answered 404; /rescue starts the instance then.
  const audit = auditOf(b, from)
  if (audit) {
    try {
      await record(supabase, audit.action, audit.target, audit.detail)
    } catch {
      return json({ error: 'Could not write the audit log, so nothing ran.' }, 502)
    }
  }

  try {
    const { result, summary } = await act(cfg, b, from)
    if (EMAILED.has(b.action) || (b.action === 'sql' && b.mode === 'write')) {
      await notify(cfg, user, audit?.action ?? b.action, summary)
    }
    return json(result)
  } catch (e) {
    // A resize that fails halfway can leave the instance stopped, so it emails either way.
    if (b.action === 'resize') {
      await notify(cfg, user, 'infra.resize failed', [`Changing ${INSTANCE_NAME} from ${from} to ${b.type} failed: ${e instanceof Error ? e.name : 'Error'}. Check its state.`])
    }
    return awsFailure(e)
  } finally {
    // A restart, a restore or a write can change what the overview and the table list show.
    clearShared('metrics')
    clearShared('dictionary')
  }
}
