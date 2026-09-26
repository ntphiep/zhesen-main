import pkg from '@/package.json'
import { supabaseEnv } from '@/lib/supabase/env'
import { z } from '@/lib/zod'

/**
 * What runs where, for the architecture map on /admin. The containers mirror
 * infra/supabase/docker-compose.yml, and test/admin-architecture.test.ts fails when the two
 * disagree, so an image bump there cannot leave this page stale.
 */
export const CONTAINERS = [
  { service: 'api-gw', container: 'supabase-envoy', image: 'envoyproxy/envoy:v1.39.1', role: 'API gateway: checks the apikey, routes /auth and /rest' },
  { service: 'auth', container: 'supabase-auth', image: 'supabase/gotrue:v2.197.0', role: 'Auth, sessions and accounts (GoTrue)' },
  { service: 'rest', container: 'supabase-rest', image: 'postgrest/postgrest:v14.17', role: 'REST API generated from the schema (PostgREST)' },
  { service: 'db', container: 'supabase-db', image: 'supabase/postgres:17.6.1.136', role: 'Postgres 17 with PGroonga and pg_trgm' },
  { service: 'meta', container: 'supabase-meta', image: 'supabase/postgres-meta:v0.99.0', role: 'Schema API for Studio' },
  { service: 'studio', container: 'supabase-studio', image: 'supabase/studio:2026.09.07-sha-7996410', role: 'Database UI, reachable only through an SSM tunnel' },
  { service: 'sampler', container: 'zhesen-sampler', image: 'python:3.13.15-alpine3.24', role: 'Host and container counters into Postgres every 5 s' },
] as const

/** infra/terraform/variables.tf `region` and `instance_type`; vercel.json `regions`. */
export const PLACEMENT = {
  awsRegion: 'ap-northeast-2',
  awsRegionName: 'Seoul',
  instanceType: 't4g.medium',
  vercelRegion: 'icn1',
  /** Kept for rollback until this date (AGENTS.md, Infrastructure). */
  cloudCopyUntil: '2026-10-23',
  cloudCopyRef: 'cvltsyoweddhpkomuevz',
} as const

const deps: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies }

/** Installed ranges as package.json declares them; the lockfile pins the exact build. */
export const STACK = [
  { name: 'Next.js', version: deps.next },
  { name: 'React', version: deps.react },
  { name: 'TypeScript', version: deps.typescript },
  { name: 'Tailwind CSS', version: deps.tailwindcss },
  { name: 'supabase-js', version: deps['@supabase/supabase-js'] },
  { name: '@supabase/ssr', version: deps['@supabase/ssr'] },
  { name: 'ts-fsrs', version: deps['ts-fsrs'] },
  { name: 'Zod', version: deps.zod },
  { name: 'Vitest', version: deps.vitest },
]

/** The deployment serving this request, from the variables Vercel sets at runtime. */
export function deployment() {
  return {
    env: process.env.VERCEL_ENV ?? 'local',
    region: process.env.VERCEL_REGION ?? null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    commitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
    node: process.version,
  }
}

export interface Probe {
  ok: boolean
  ms: number
  /** What answered, e.g. "GoTrue v2.197.0", or why it failed. */
  detail: string
}

const gotrueHealth = z.object({ version: z.string(), name: z.string() })

/**
 * One request through CloudFront and Envoy to GoTrue: if it answers, the edge, the gateway
 * and the auth container are all up. Not cached, because a cached answer would say nothing.
 */
export async function probeAuth(fetchImpl: typeof fetch = fetch): Promise<Probe> {
  const { url, anonKey } = supabaseEnv()
  const started = performance.now()
  try {
    const res = await fetchImpl(`${url}/auth/v1/health`, {
      headers: { apikey: anonKey },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    const ms = Math.round(performance.now() - started)
    if (!res.ok) return { ok: false, ms, detail: `HTTP ${res.status}` }
    const body = gotrueHealth.safeParse(await res.json())
    return { ok: true, ms, detail: body.success ? `${body.data.name} ${body.data.version}` : 'GoTrue' }
  } catch (e) {
    return { ok: false, ms: Math.round(performance.now() - started), detail: e instanceof Error ? e.name : 'Error' }
  }
}

/** The host part of the Supabase URL, which is the CloudFront domain in production. */
export function edgeHost(): string {
  return new URL(supabaseEnv().url).host
}
