import { createHmac, randomInt } from 'node:crypto'
import {
  DescribeParametersCommand, GetParameterCommand, GetParametersCommand, PutParameterCommand, type SSMClient,
} from '@aws-sdk/client-ssm'
import { z } from '@/lib/zod'
import { APP_KEYS, appParameter, type AppKey } from '@/lib/secrets'
import { REGION } from '@/lib/admin/ssm'

/**
 * Every secret this deployment uses, for /admin/secrets: where it lives, what changing it
 * sets off, and the pieces that change it. Values never leave this module except through
 * the reveal action, which app/api/admin/secrets/route.ts guards and audits.
 */

export const PREFIX = '/zhesen/prod'

/**
 * Which services of infra/supabase/docker-compose.yml read each variable the instance's
 * .env gets from SSM, so an edit recreates exactly those. test/admin-secrets.test.ts
 * fails when the compose file references one of these from a service not listed here.
 */
export const INSTANCE_SERVICES = {
  POSTGRES_PASSWORD: ['studio', 'auth', 'rest', 'meta', 'db'],
  JWT_SECRET: ['studio', 'auth', 'rest'],
  ANON_KEY: ['studio', 'api-gw'],
  SERVICE_ROLE_KEY: ['studio', 'api-gw', 'sampler'],
  DASHBOARD_PASSWORD: ['api-gw'],
  PG_META_CRYPTO_KEY: ['studio', 'meta'],
  SECRET_KEY_BASE: [],
  VAULT_ENC_KEY: [],
} as const satisfies Record<string, readonly string[]>

export type InstanceVariable = keyof typeof INSTANCE_SERVICES

/** What an edit does after the typed confirmation:
 *  app       PutParameter; the app reads it through lib/secrets.ts within 60 s
 *  ssm       PutParameter; read on its next use
 *  instance  PutParameter, render .env on the instance, recreate the services that read it
 *  postgres  as instance, after changing the database roles' passwords
 *  jwt       new jwt_secret, anon and service_role keys, instance, then Vercel and a redeploy
 *  vercel    Vercel env var, then a production redeploy */
export type Apply = 'app' | 'ssm' | 'instance' | 'postgres' | 'jwt' | 'vercel'

export type Group = 'App keys' | 'Instance' | 'Vercel' | 'Elsewhere'

export interface SecretDef {
  id: string
  group: Group
  purpose: string
  parameter?: string
  /** The Vercel env var: the fallback for an app key, the only home of a Vercel one. */
  env?: string
  variable?: InstanceVariable
  secure: boolean
  apply: Apply | null
  /** Why `apply` is null. */
  locked?: string
  /** Length of a generated value, for a value this project makes rather than a provider issues. */
  generate?: number
  /** What a typed value must look like, and the words when it does not. */
  pattern?: RegExp
  hint?: string
  revealable?: false
  test?: 'azure' | 'ai'
}

/** Letters and digits only: bin/render-env.sh substitutes values with bash `${x//a/b}`,
 *  where `&` means the match, and upstream advises the same for connection strings. */
const ALNUM = (min: number, max = 256) => ({
  pattern: new RegExp(`^[A-Za-z0-9]{${min},${max}}$`),
  hint: min === max ? `Exactly ${min} letters and digits.` : `${min} to ${max} letters and digits.`,
})
const NO_SPACE = { pattern: /^\S{1,4096}$/, hint: 'One line, no spaces.' }
const URL_PATTERN = { pattern: /^https?:\/\/[^\s]+$/, hint: 'A URL starting with http:// or https://.' }

const APP: Record<AppKey, Pick<SecretDef, 'purpose' | 'secure' | 'generate' | 'test' | 'pattern' | 'hint'>> = {
  AZURE_TRANSLATOR_KEY: { purpose: 'Azure AI Translator key for the passage translation.', secure: true, test: 'azure', ...NO_SPACE },
  AZURE_TRANSLATOR_REGION: { purpose: 'Azure resource region sent with every translate call; eastasia when unset.', secure: false, test: 'azure', ...NO_SPACE },
  AZURE_TRANSLATOR_ENDPOINT: { purpose: 'Azure Translator endpoint; the global one when unset.', secure: false, test: 'azure', ...URL_PATTERN },
  AI_BASE_URL: { purpose: 'Base URL of the 9router endpoint the assistant calls, with /v1.', secure: false, test: 'ai', ...URL_PATTERN },
  AI_API_KEY: { purpose: '9router API key for the assistant.', secure: true, test: 'ai', ...NO_SPACE },
  AI_MODEL: { purpose: 'Model the assistant asks 9router for; ag/gemini-3.8-flash when unset.', secure: false, test: 'ai', ...NO_SPACE },
  REVALIDATE_SECRET: { purpose: 'Header secret for POST /api/revalidate, which flushes the dictionary cache.', secure: true, generate: 40, ...NO_SPACE },
  VERCEL_TOKEN: { purpose: 'Vercel API token this page uses to write Vercel env vars and start a redeploy. Optional.', secure: true, ...NO_SPACE },
}

const DERIVED = 'Signed with jwt_secret; it changes only through the jwt_secret rotation.'

export const SECRETS: SecretDef[] = [
  ...APP_KEYS.map((key): SecretDef => ({
    id: key.toLowerCase(), group: 'App keys', parameter: appParameter(key), env: key, apply: 'app', ...APP[key],
  })),
  { id: 'postgres_password', group: 'Instance', parameter: `${PREFIX}/postgres_password`, variable: 'POSTGRES_PASSWORD', secure: true, apply: 'postgres', generate: 40, ...ALNUM(16),
    purpose: 'Password of the database roles the services log in as.' },
  { id: 'jwt_secret', group: 'Instance', parameter: `${PREFIX}/jwt_secret`, variable: 'JWT_SECRET', secure: true, apply: 'jwt', generate: 64, ...ALNUM(32),
    purpose: 'HS256 secret that signs every session and the anon and service_role keys.' },
  { id: 'anon_key', group: 'Instance', parameter: `${PREFIX}/anon_key`, variable: 'ANON_KEY', secure: false, apply: null, locked: DERIVED,
    purpose: 'Legacy anon JWT; Envoy compares the apikey header to it by string equality.' },
  { id: 'service_role_key', group: 'Instance', parameter: `${PREFIX}/service_role_key`, variable: 'SERVICE_ROLE_KEY', secure: true, apply: null, locked: DERIVED,
    purpose: 'JWT that bypasses RLS; Studio and the sampler use it.' },
  { id: 'dashboard_password', group: 'Instance', parameter: `${PREFIX}/dashboard_password`, variable: 'DASHBOARD_PASSWORD', secure: true, apply: 'instance', generate: 32, ...ALNUM(16),
    purpose: 'Basic-auth password Envoy asks for in front of Studio.' },
  { id: 'pg_meta_crypto_key', group: 'Instance', parameter: `${PREFIX}/pg_meta_crypto_key`, variable: 'PG_META_CRYPTO_KEY', secure: true, apply: 'instance', generate: 32, ...ALNUM(16),
    purpose: 'Encrypts the connection strings Studio sends to postgres-meta.' },
  { id: 'secret_key_base', group: 'Instance', parameter: `${PREFIX}/secret_key_base`, variable: 'SECRET_KEY_BASE', secure: true, apply: 'instance', generate: 64, ...ALNUM(16),
    purpose: 'Rendered into .env; no service here reads it (Realtime or Supavisor would).' },
  { id: 'vault_enc_key', group: 'Instance', parameter: `${PREFIX}/vault_enc_key`, variable: 'VAULT_ENC_KEY', secure: true, apply: 'instance', generate: 32, ...ALNUM(32, 32),
    purpose: 'Rendered into .env; no service here reads it (Supavisor would).' },
  { id: 'admin_rescue_secret', group: 'Instance', parameter: `${PREFIX}/admin_rescue_secret`, secure: true, apply: 'ssm', generate: 40, ...ALNUM(16),
    purpose: 'Secret for /rescue, the way in when the database is down.' },
  { id: 'alert_channels', group: 'Instance', parameter: `${PREFIX}/alert_channels`, secure: true, apply: null, locked: 'Edited on /admin/infra under Alerts.',
    purpose: 'Slack webhook and Telegram bot the admin alerts go to, as JSON.' },
  { id: 'NEXT_PUBLIC_SUPABASE_URL', group: 'Vercel', env: 'NEXT_PUBLIC_SUPABASE_URL', secure: false, apply: 'vercel', ...URL_PATTERN,
    purpose: 'Supabase URL built into the browser bundle: the CloudFront domain.' },
  { id: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', group: 'Vercel', env: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', secure: false, apply: null,
    locked: 'Must equal anon_key; it changes only through the jwt_secret rotation.',
    purpose: 'Anon JWT built into the browser bundle.' },
  { id: 'AWS_ROLE_ARN', group: 'Vercel', env: 'AWS_ROLE_ARN', secure: false, apply: 'vercel',
    pattern: /^arn:aws:iam::\d{12}:role\/[\w+=,.@/-]+$/, hint: 'An IAM role ARN, arn:aws:iam::<account>:role/<name>.',
    purpose: 'IAM role every function assumes through Vercel OIDC for its AWS calls.' },
  { id: '9router_dashboard_password', group: 'Elsewhere', secure: true, apply: null, revealable: false,
    locked: 'Kept only as a hash inside 9router: change it in the 9router dashboard, reached through an SSM tunnel to port 20128.',
    purpose: 'Password of the 9router dashboard.' },
]

export function findSecret(id: string): SecretDef | undefined {
  return SECRETS.find((s) => s.id === id)
}

/** The services an edit of `def` recreates. */
export function servicesFor(def: SecretDef): string[] {
  const vars: InstanceVariable[] = def.apply === 'jwt' ? ['JWT_SECRET', 'ANON_KEY', 'SERVICE_ROLE_KEY'] : def.variable ? [def.variable] : []
  return [...new Set(vars.flatMap((v) => INSTANCE_SERVICES[v]))]
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

export function generateSecret(length: number): string {
  return Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
}

export const tail = (s: string) => s.slice(-4)

/* ---------- JWT rotation ---------- */

const b64url = (s: string) => Buffer.from(s, 'utf8').toString('base64url')

export function signJwt(payload: Record<string, unknown>, secret: string): string {
  const head = `${b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64url(JSON.stringify(payload))}`
  return `${head}.${createHmac('sha256', secret).update(head).digest('base64url')}`
}

/** The current anon key's claims (decoded on production: iss, ref, role, iat, exp). */
const claimsSchema = z.object({ iss: z.string(), ref: z.string().optional(), role: z.string(), iat: z.number(), exp: z.number() })

/** New anon and service_role keys with the current anon key's issuer, ref and lifetime. */
export function rotatedKeys(currentAnon: string, secret: string, now: number = Date.now()): { anon: string; serviceRole: string } {
  const c = claimsSchema.parse(JSON.parse(Buffer.from(currentAnon.split('.')[1] ?? '', 'base64url').toString('utf8')))
  const iat = Math.floor(now / 1000)
  const claims = (role: string) => ({ iss: c.iss, ...(c.ref ? { ref: c.ref } : {}), role, iat, exp: iat + (c.exp - c.iat) })
  return { anon: signJwt(claims('anon'), secret), serviceRole: signJwt(claims('service_role'), secret) }
}

/* ---------- Scripts for the instance ---------- */

const STACK = '/opt/zhesen/supabase'

/** Render .env from SSM, then recreate the services that read the changed variable. */
export function applyScript(services: readonly string[]): string {
  return `cd ${STACK} && ./bin/render-env.sh${services.length ? ` && docker compose up -d ${services.join(' ')}` : ''}`
}

/** Every role upstream's docker/utils/db-passwd.sh gives POSTGRES_PASSWORD, from
 *  https://supabase.com/docs/guides/self-hosting/docker#changing-database-password and
 *  https://github.com/supabase/supabase/blob/master/docker/utils/db-passwd.sh. Its
 *  _supavisor and _analytics steps are left out: neither runs here. */
export const POSTGRES_ROLES = [
  'anon', 'authenticated', 'authenticator', 'dashboard_user', 'pgbouncer', 'postgres', 'service_role',
  'supabase_admin', 'supabase_auth_admin', 'supabase_functions_admin', 'supabase_replication_admin', 'supabase_storage_admin',
] as const

export const ROLES_OK = 'ROLES_OK'

/** The new password is read from SSM on the instance and reaches psql through the
 *  environment, so it is in neither the Run Command history nor a process list. One
 *  transaction: a missing role changes none. */
export function postgresPasswordScript(services: readonly string[]): string {
  const sql = ['\\set pw `echo "$PW"`', ...POSTGRES_ROLES.map((r) => `alter role ${r} with password :'pw';`)].join('\n')
  return [
    'set -e',
    `PW="$(aws ssm get-parameter --region ${REGION} --name ${PREFIX}/postgres_password --with-decryption --query Parameter.Value --output text)"`,
    'export PW',
    `echo ${Buffer.from(sql, 'utf8').toString('base64')} | base64 -d | docker exec -i -e PW supabase-db psql -U supabase_admin -d postgres -X -q --single-transaction -v ON_ERROR_STOP=1`,
    `echo ${ROLES_OK}`,
    applyScript(services),
  ].join('\n')
}

/* ---------- SSM ---------- */

export interface ParameterMeta {
  type: string
  version: number
  changedAt: string
}

const describeSchema = z.object({
  Parameters: z.array(z.object({
    Name: z.string(), Type: z.string(), Version: z.number(), LastModifiedDate: z.coerce.date(),
  })).default([]),
  NextToken: z.string().optional(),
})

/** Names, types, versions and dates under /zhesen/prod; DescribeParameters returns no values. */
export async function describeParameters(ssm: SSMClient): Promise<Map<string, ParameterMeta>> {
  const out = new Map<string, ParameterMeta>()
  let token: string | undefined
  do {
    const page = describeSchema.parse(await ssm.send(new DescribeParametersCommand({
      ParameterFilters: [{ Key: 'Path', Option: 'Recursive', Values: [PREFIX] }], MaxResults: 50, NextToken: token,
    })))
    for (const p of page.Parameters) out.set(p.Name, { type: p.Type, version: p.Version, changedAt: p.LastModifiedDate.toISOString() })
    token = page.NextToken
  } while (token)
  return out
}

const valuesSchema = z.object({ Parameters: z.array(z.object({ Name: z.string(), Value: z.string() })).default([]) })

/** Decrypted values, ten names per GetParameters call, its limit. */
export async function readValues(ssm: SSMClient, names: string[]): Promise<Map<string, string>> {
  const chunks = Array.from({ length: Math.ceil(names.length / 10) }, (_, i) => names.slice(i * 10, i * 10 + 10))
  const pages = await Promise.all(chunks.map((Names) => ssm.send(new GetParametersCommand({ Names, WithDecryption: true }))))
  return new Map(pages.flatMap((p) => valuesSchema.parse(p).Parameters.map((x) => [x.Name, x.Value] as const)))
}

const oneSchema = z.object({ Parameter: z.object({ Value: z.string() }) })

export async function readValue(ssm: SSMClient, name: string): Promise<string | null> {
  try {
    return oneSchema.parse(await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }))).Parameter.Value
  } catch (e) {
    if (e instanceof Error && e.name === 'ParameterNotFound') return null
    throw e
  }
}

export async function writeValue(ssm: SSMClient, name: string, value: string, type: string): Promise<void> {
  await ssm.send(new PutParameterCommand({ Name: name, Value: value, Type: type === 'SecureString' ? 'SecureString' : 'String', Overwrite: true }))
}

/* ---------- Inventory ---------- */

export interface SecretRow {
  id: string
  group: Group | 'Config'
  purpose: string
  where: string
  set: boolean
  changedAt: string | null
  version: number | null
  last4: string | null
  /** Only for a String parameter that holds no secret. */
  value: string | null
  revealable: boolean
  apply: Apply | null
  locked: string | null
  generate: boolean
  hint: string | null
  test: 'azure' | 'ai' | null
  services: string[]
}

const TERRAFORM = 'Terraform owns this value (infra/terraform, settings module) and would put it back on the next apply; change it there.'

/** One row per secret, from parameter metadata, decrypted values and this function's env. */
export function buildInventory(meta: Map<string, ParameterMeta>, values: Map<string, string>, env: Record<string, string | undefined>): SecretRow[] {
  const known = new Set(SECRETS.flatMap((s) => (s.parameter ? [s.parameter] : [])))
  const rows = SECRETS.map((s): SecretRow => {
    const m = s.parameter ? meta.get(s.parameter) : undefined
    const ssm = s.parameter ? values.get(s.parameter) : undefined
    const fromEnv = s.env ? env[s.env]?.trim() || undefined : undefined
    const effective = ssm ?? fromEnv
    let where: string
    if (s.group === 'Elsewhere') where = '9router'
    else if (s.parameter && s.env) {
      where = ssm && fromEnv ? `SSM ${s.parameter} (in effect), and Vercel ${s.env}`
        : ssm ? `SSM ${s.parameter}` : fromEnv ? `Vercel ${s.env}; no SSM parameter yet` : `Neither SSM ${s.parameter} nor Vercel ${s.env}`
    } else where = s.parameter ? `SSM ${s.parameter}` : `Vercel ${s.env}`
    return {
      id: s.id, group: s.group, purpose: s.purpose, where,
      set: s.group === 'Elsewhere' || effective !== undefined,
      changedAt: m?.changedAt ?? null, version: m?.version ?? null,
      last4: effective ? tail(effective) : null, value: null,
      revealable: s.revealable !== false && effective !== undefined,
      apply: s.apply, locked: s.locked ?? null, generate: s.generate !== undefined, hint: s.hint ?? null,
      test: s.test ?? null, services: servicesFor(s),
    }
  })
  const config = [...meta.entries()].filter(([name, m]) => !known.has(name) && m.type === 'String').map(([name, m]): SecretRow => ({
    id: name.slice(PREFIX.length + 1), group: 'Config', purpose: 'Plain configuration, not a secret.', where: `SSM ${name}`,
    set: values.has(name), changedAt: m.changedAt, version: m.version, last4: null, value: values.get(name) ?? null,
    revealable: false, apply: null, locked: TERRAFORM, generate: false, hint: null, test: null, services: [],
  }))
  return [...rows, ...config.sort((a, b) => a.id.localeCompare(b.id))]
}
