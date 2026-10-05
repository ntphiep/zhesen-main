import 'server-only'
import { GetParameterCommand } from '@aws-sdk/client-ssm'
import { z } from '@/lib/zod'
import { awsHealthConfig } from '@/lib/admin/aws'
import { clients } from '@/lib/admin/ssm'

/**
 * The secret public.ai_coach_store asks for before writing a shared coach answer
 * (supabase/migrations/0181_ai_coach_cache.sql). Read on its own rather than through APP_KEYS
 * in lib/secrets.ts: that set is one GetParameters call, which takes at most ten names, and
 * it already holds ten. The env var of the same name is the fallback; null skips the write.
 */
export const AI_CACHE_PARAMETER = '/zhesen/prod/ai_cache_secret'

const CACHE_MS = 60_000
const TIMEOUT_MS = 2_000
const parameterSchema = z.object({ Parameter: z.object({ Value: z.string() }) })

let cached: { at: number; value: Promise<string | null> } | null = null

async function read(): Promise<string | null> {
  const cfg = awsHealthConfig()
  if (cfg) {
    try {
      const out = await clients(cfg).ssm.send(
        new GetParameterCommand({ Name: AI_CACHE_PARAMETER, WithDecryption: true }),
        { abortSignal: AbortSignal.timeout(TIMEOUT_MS) },
      )
      const value = parameterSchema.parse(out).Parameter.Value.trim()
      if (value) return value
    } catch {
      // A missing parameter or an SSM error falls back to the env var.
    }
  }
  return process.env.AI_CACHE_SECRET?.trim() || null
}

export function aiCacheSecret(now: number = Date.now()): Promise<string | null> {
  if (!cached || now - cached.at >= CACHE_MS) cached = { at: now, value: read() }
  return cached.value
}

/** Drop the cached value, in tests. */
export function resetAiCacheSecret(): void {
  cached = null
}
