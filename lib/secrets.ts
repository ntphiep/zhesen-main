import { GetParametersCommand } from '@aws-sdk/client-ssm'
import { z } from '@/lib/zod'
import { awsHealthConfig } from '@/lib/admin/aws'
import { clients } from '@/lib/admin/ssm'

/**
 * The app's own keys, read from SSM Parameter Store so /admin/secrets can change one
 * without a redeploy. The Vercel env var of the same name is the fallback: no AWS_ROLE_ARN
 * (preview, local dev), a missing parameter and an SSM error all read it instead.
 */
export const APP_PARAMETERS = {
  AZURE_TRANSLATOR_KEY: '/zhesen/prod/azure_translator_key',
  AZURE_TRANSLATOR_REGION: '/zhesen/prod/azure_translator_region',
  AZURE_TRANSLATOR_ENDPOINT: '/zhesen/prod/azure_translator_endpoint',
  AI_BASE_URL: '/zhesen/prod/ai_base_url',
  AI_API_KEY: '/zhesen/prod/ai_api_key',
  AI_MODEL: '/zhesen/prod/ai_model',
  REVALIDATE_SECRET: '/zhesen/prod/revalidate_secret',
  VERCEL_TOKEN: '/zhesen/prod/vercel_token',
} as const

export type AppKey = keyof typeof APP_PARAMETERS
const KEYS = Object.keys(APP_PARAMETERS) as AppKey[]

/** A key changed from /admin/secrets reaches every other function instance within this. */
export const CACHE_MS = 60_000
/** GetParameters sits in front of the translate route, so a stuck call must not hold it. */
const TIMEOUT_MS = 2_000

const parametersSchema = z.object({
  Parameters: z.array(z.object({ Name: z.string(), Value: z.string() })).default([]),
})

type Values = Partial<Record<AppKey, string>>

let cached: { at: number; values: Promise<Values> } | null = null

/** One GetParameters call for the whole set (the API takes at most 10 names). An error
 *  answers nothing, so every key falls back to its env var until the next read. */
async function readSsm(): Promise<Values> {
  const cfg = awsHealthConfig()
  if (!cfg) return {}
  try {
    const out = await clients(cfg).ssm.send(
      new GetParametersCommand({ Names: KEYS.map((k) => APP_PARAMETERS[k]), WithDecryption: true }),
      { abortSignal: AbortSignal.timeout(TIMEOUT_MS) },
    )
    const byName = new Map(parametersSchema.parse(out).Parameters.map((p) => [p.Name, p.Value.trim()]))
    return Object.fromEntries(KEYS.flatMap((k) => {
      const v = byName.get(APP_PARAMETERS[k])
      return v ? [[k, v]] : []
    }))
  } catch {
    return {}
  }
}

/** The SSM half alone, for the inventory on /admin/secrets. */
export function ssmAppValues(now: number = Date.now()): Promise<Values> {
  if (!cached || now - cached.at >= CACHE_MS) cached = { at: now, values: readSsm() }
  return cached.values
}

/** Every app key as it is in effect: the SSM value, else the env var, else undefined. */
export async function runtimeEnv(now: number = Date.now()): Promise<Values> {
  const ssm = await ssmAppValues(now)
  return Object.fromEntries(KEYS.flatMap((k) => {
    const v = ssm[k] || process.env[k]?.trim()
    return v ? [[k, v]] : []
  }))
}

/** Drop the cached answer: after an edit on this instance, and in tests. */
export function resetRuntimeEnv(): void {
  cached = null
}
