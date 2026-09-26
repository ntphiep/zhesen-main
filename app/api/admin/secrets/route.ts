import type { SSMClient } from '@aws-sdk/client-ssm'
import { createClient } from '@/lib/supabase/server'
import { adminUser } from '@/lib/auth/admin'
import { z } from '@/lib/zod'
import { awsHealthConfig } from '@/lib/admin/aws'
import { clients, runShell, type ShellResult } from '@/lib/admin/ssm'
import { checkGuard, notify, record } from '@/lib/admin/guard'
import { badRequest, notFoundJson, readJson } from '@/lib/admin/respond'
import {
  PREFIX, ROLES_OK, applyScript, buildInventory, describeParameters, findSecret, generateSecret, postgresPasswordScript,
  readValue, readValues, rotatedKeys, servicesFor, writeValue, type SecretDef,
} from '@/lib/admin/secrets'
import { envRecordIds, redeployProduction, setEnv, vercelTarget, VercelError, type VercelTarget } from '@/lib/admin/vercel'
import { resetRuntimeEnv, CACHE_MS } from '@/lib/secrets'
import { aiConfig } from '@/lib/ai/config'
import { azureTranslatorConfig } from '@/lib/translate/config'
import { translateText } from '@/lib/translate/azure'

/** A postgres_password or jwt_secret edit waits on a render and a recreate of five services. */
export const maxDuration = 300

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE })

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('reveal'), id: z.string() }),
  z.object({ action: z.literal('update'), id: z.string(), value: z.string().optional(), generate: z.boolean().default(false), confirm: z.string().optional() }),
  z.object({ action: z.literal('test'), id: z.string() }),
])

/** The error's name says what to fix; its message can carry an ARN, never a value here. */
function failure(e: unknown): Response {
  if (e instanceof VercelError) return json({ error: e.message }, 502)
  return json({ error: `AWS refused or did not answer (${e instanceof Error ? e.name : 'Error'}).` }, 502)
}

/** Every secret, values reduced to their last four characters. */
export async function GET(): Promise<Response> {
  const supabase = await createClient()
  if (!(await adminUser(supabase))) return notFoundJson()
  const cfg = awsHealthConfig()
  if (!cfg) return json({ enabled: false })
  try {
    const { ssm } = clients(cfg)
    const meta = await describeParameters(ssm)
    const values = await readValues(ssm, [...meta.keys()])
    const vercelToken = values.has(`${PREFIX}/vercel_token`) || Boolean(process.env.VERCEL_TOKEN?.trim())
    return json({ rows: buildInventory(meta, values, process.env), vercelToken })
  } catch (e) {
    return failure(e)
  }
}

/** What the app itself would read now: SSM first, then the env var. */
async function effectiveValue(ssm: SSMClient, def: SecretDef): Promise<string | null> {
  const fromSsm = def.parameter ? await readValue(ssm, def.parameter) : null
  return fromSsm ?? (def.env ? process.env[def.env]?.trim() || null : null)
}

async function parameterType(ssm: SSMClient, def: SecretDef): Promise<string> {
  const meta = def.parameter ? (await describeParameters(ssm)).get(def.parameter) : undefined
  return meta?.type ?? (def.secure ? 'SecureString' : 'String')
}

class ApplyError extends Error {}

function shellFailed(what: string, r: ShellResult): ApplyError {
  return new ApplyError(`${what} (${r.status}, exit ${r.exitCode}): ${(r.stderr || r.stdout).trim().slice(-400)}`)
}

type Write = [name: string, value: string, type: string]

/** Writes each previous value back; returns the parameters still holding the new one. */
async function restore(ssm: SSMClient, writes: Write[], before: Map<string, string>): Promise<string[]> {
  const stuck: string[] = []
  for (const [n, , t] of writes) {
    const old = before.get(n)
    const ok = old ? await writeValue(ssm, n, old, t).then(() => true, () => false) : false
    if (!ok) stuck.push(n)
  }
  return stuck
}

/** Runs the change and returns its summary lines. Throws ApplyError with words for the owner. */
async function apply(ssm: SSMClient, def: SecretDef, value: string, vercel: VercelTarget | null): Promise<string[]> {
  const services = servicesFor(def)
  const recreated = services.length ? `recreated ${services.join(', ')}` : 'no service reads it'
  switch (def.apply) {
    case 'app': {
      await writeValue(ssm, def.parameter ?? '', value, await parameterType(ssm, def))
      resetRuntimeEnv()
      return [`Saved ${def.parameter}. This server uses it now, every other within ${CACHE_MS / 1000} s.`]
    }
    case 'ssm': {
      await writeValue(ssm, def.parameter ?? '', value, await parameterType(ssm, def))
      return [`Saved ${def.parameter}. It is read on its next use.`]
    }
    case 'instance': {
      await writeValue(ssm, def.parameter ?? '', value, await parameterType(ssm, def))
      const r = await runShell(ssm, applyScript(services), 180)
      if (r.exitCode !== 0) throw shellFailed(`Saved ${def.parameter}, but render or recreate failed, so some services may still run the old value; run bin/render-env.sh and docker compose up -d on the instance`, r)
      return [`Saved ${def.parameter}, rendered .env, ${recreated}.`]
    }
    case 'postgres': {
      const name = def.parameter ?? ''
      const previous = await readValue(ssm, name)
      await writeValue(ssm, name, value, 'SecureString')
      const r = await runShell(ssm, postgresPasswordScript(services), 240)
      if (!r.stdout.includes(ROLES_OK)) {
        const stuck = await restore(ssm, [[name, value, 'SecureString']], new Map(previous ? [[name, previous]] : []))
        throw shellFailed(stuck.length
          ? `The database refused the new password, but ${name} could not be put back; set it to its previous version in SSM before anything renders .env`
          : 'The database refused the new password, so nothing changed and the parameter is back as it was', r)
      }
      if (r.exitCode !== 0) throw shellFailed('The roles have the new password, but render or recreate failed; run bin/render-env.sh and docker compose up -d on the instance', r)
      return [`Changed the password of every database role, saved ${name}, rendered .env, ${recreated}.`]
    }
    case 'jwt': {
      if (!vercel) throw new ApplyError('Vercel is not configured.')
      // Before the instance changes: a Vercel refusal after it leaves every browser on the old anon key.
      const anonIds = await envRecordIds(vercel, 'NEXT_PUBLIC_SUPABASE_ANON_KEY').catch((e: unknown) => {
        throw new ApplyError(`Nothing changed: ${e instanceof Error ? e.message : 'Vercel did not answer'}.`)
      })
      const names = { secret: `${PREFIX}/jwt_secret`, anon: `${PREFIX}/anon_key`, service: `${PREFIX}/service_role_key` }
      const meta = await describeParameters(ssm)
      const before = await readValues(ssm, Object.values(names))
      const currentAnon = before.get(names.anon)
      if (!currentAnon) throw new ApplyError('anon_key could not be read, so its claims cannot be copied.')
      const keys = rotatedKeys(currentAnon, value)
      const typeOf = (n: string, fallback: string) => meta.get(n)?.type ?? fallback
      const writes: Write[] = [
        [names.secret, value, typeOf(names.secret, 'SecureString')],
        [names.anon, keys.anon, typeOf(names.anon, 'String')],
        [names.service, keys.serviceRole, typeOf(names.service, 'SecureString')],
      ]
      const written: Write[] = []
      try {
        for (const w of writes) {
          await writeValue(ssm, ...w)
          written.push(w)
        }
      } catch (e) {
        const stuck = await restore(ssm, written, before)
        throw new ApplyError(`AWS refused a write (${e instanceof Error ? e.name : 'Error'}), so the instance and Vercel were not touched; ${
          stuck.length ? `${stuck.join(', ')} still hold the new value, set them to their previous versions in SSM` : 'the parameters are back as they were'}.`)
      }
      const r = await runShell(ssm, applyScript(services), 240)
      if (r.exitCode !== 0) {
        // render-env.sh has already written the new .env and some services may run it.
        const stuck = await restore(ssm, writes, before)
        if (stuck.length) {
          throw shellFailed(`Render or recreate failed and ${stuck.join(', ')} could not be put back; set them to their previous versions in SSM, then run bin/render-env.sh and docker compose up -d on the instance. Vercel was not touched`, r)
        }
        const back = await runShell(ssm, applyScript(services), 240)
        throw shellFailed(back.exitCode === 0
          ? 'Render or recreate failed; the parameters are back and the instance runs the old keys again. Vercel was not touched'
          : 'Render or recreate failed, and so did rendering the old keys again; the parameters are back, so run bin/render-env.sh and docker compose up -d on the instance. Vercel was not touched', r)
      }
      try {
        await setEnv(vercel, anonIds, keys.anon)
        const d = await redeployProduction(vercel)
        return [`Rotated jwt_secret, anon_key and service_role_key, ${recreated}.`, `Vercel has the new anon key; production build ${d.id} started (https://${d.url}).`]
      } catch (e) {
        throw new ApplyError(`The instance runs the new keys, but Vercel was not updated (${e instanceof Error ? e.message : 'error'}). Set NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel to the new anon_key, which this page reveals, and redeploy production.`)
      }
    }
    case 'vercel': {
      if (!vercel || !def.env) throw new ApplyError('Vercel is not configured.')
      await setEnv(vercel, await envRecordIds(vercel, def.env), value)
      const d = await redeployProduction(vercel)
      return [`Saved ${def.env} in Vercel; production build ${d.id} started (https://${d.url}).`]
    }
    default:
      throw new ApplyError(def.locked ?? 'This secret cannot be changed here.')
  }
}

async function runTest(kind: 'azure' | 'ai'): Promise<string> {
  const started = Date.now()
  const ms = () => `${Date.now() - started} ms`
  if (kind === 'azure') {
    const cfg = await azureTranslatorConfig()
    if (!cfg) return 'Not configured: azure_translator_key is set in neither SSM nor Vercel.'
    try {
      const r = await translateText(cfg, 'Good morning', 'en', ['vi'], AbortSignal.timeout(10_000))
      return `Azure translated "Good morning" to "${r.translations.vi ?? '?'}" in ${ms()}.`
    } catch (e) {
      return `Azure failed after ${ms()}: ${e instanceof Error ? e.message : 'error'}.`
    }
  }
  const cfg = await aiConfig()
  if (!cfg) return 'Not configured: ai_base_url or ai_api_key is set in neither SSM nor Vercel.'
  try {
    // One token through the endpoint the assistant uses, with its headers (lib/ai/client.ts).
    const res = await fetch(`${cfg.baseUrl}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey, authorization: `Bearer ${cfg.apiKey}`, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: cfg.model, max_tokens: 1, stream: false, messages: [{ role: 'user', content: 'ping' }] }),
      signal: AbortSignal.timeout(20_000),
    })
    return res.ok
      ? `The router answered a one-token call to ${cfg.model} in ${ms()}.`
      : `The router answered HTTP ${res.status} for ${cfg.model} in ${ms()}.`
  } catch (e) {
    return `Could not reach the router (${e instanceof Error ? e.name : 'Error'}) after ${ms()}.`
  }
}

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient()
  const user = await adminUser(supabase)
  if (!user) return notFoundJson()
  const parsed = body.safeParse(await readJson(request))
  if (!parsed.success) return badRequest()
  const b = parsed.data
  const def = findSecret(b.id)
  if (!def) return badRequest()

  const cfg = awsHealthConfig()
  if (!cfg) return json({ error: 'AWS access is not configured for this deployment (AWS_ROLE_ARN).' }, 503)
  const { ssm } = clients(cfg)

  if (b.action === 'test') {
    if (!def.test) return badRequest()
    return json({ result: await runTest(def.test) })
  }

  if (b.action === 'reveal') {
    if (def.revealable === false) return json({ error: def.locked ?? 'This value cannot be shown.' }, 409)
    const refusal = await checkGuard(supabase, undefined, null)
    if (refusal) return json(refusal.body, refusal.status)
    try {
      await record(supabase, 'secret.reveal', def.id, {})
    } catch {
      return json({ error: 'Could not write the audit log, so nothing was shown.' }, 502)
    }
    let value: string | null
    try {
      value = await effectiveValue(ssm, def)
    } catch (e) {
      return failure(e)
    }
    await notify(cfg, user, 'secret.reveal', [`Revealed ${def.id}.`])
    if (value === null) return json({ error: 'Not set.' }, 404)
    return json({ value })
  }

  // update
  if (!def.apply) return json({ error: def.locked ?? 'This secret cannot be changed here.' }, 409)
  const value = b.generate ? (def.generate ? generateSecret(def.generate) : null) : b.value?.trim() ?? ''
  if (value === null) return json({ error: 'This value comes from its provider; paste it rather than generate one.' }, 400)
  if (def.pattern && !def.pattern.test(value)) return json({ error: def.hint ?? 'Invalid value.' }, 400)
  if (!value) return json({ error: 'Enter a value.' }, 400)

  let vercel: VercelTarget | null = null
  if (def.apply === 'jwt' || def.apply === 'vercel') {
    const t = await vercelTarget()
    if (typeof t === 'string') return json({ error: t }, 409)
    vercel = t
  }

  const refusal = await checkGuard(supabase, b.confirm, def.id)
  if (refusal) return json(refusal.body, refusal.status)
  try {
    await record(supabase, 'secret.update', def.id, { generated: b.generate, apply: def.apply })
  } catch {
    return json({ error: 'Could not write the audit log, so nothing was changed.' }, 502)
  }

  try {
    const summary = await apply(ssm, def, value, vercel)
    await notify(cfg, user, 'secret.update', summary)
    return json({ summary })
  } catch (e) {
    const message = e instanceof ApplyError ? e.message : null
    await notify(cfg, user, 'secret.update failed', [`Changing ${def.id} failed: ${message ?? (e instanceof Error ? e.name : 'Error')}.`])
    return message ? json({ error: message }, 502) : failure(e)
  }
}
