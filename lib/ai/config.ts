import { runtimeEnv } from '@/lib/secrets'

/**
 * Where the assistant gets its model: SSM first, then the env var (lib/secrets.ts).
 * Server-only: no `NEXT_PUBLIC_` here, so the key never reaches a bundle, and the browser
 * goes through `app/api/ai/route.ts`. `aiConfig()`
 * returning null is a supported state -- the router is on a private network, so a
 * deployment that cannot reach it serves the dictionary with the assistant buttons absent.
 */
export interface AiConfig {
  /** Base URL including the version segment, e.g. http://host:20128/v1 */
  baseUrl: string
  apiKey: string
  model: string
}

/** Default model: the cheap fast tier of the family the project owner pays for. */
const DEFAULT_MODEL = 'ag/gemini-3.8-flash'

export async function aiConfig(): Promise<AiConfig | null> {
  const env = await runtimeEnv()
  const baseUrl = env.AI_BASE_URL?.replace(/\/$/, '')
  const apiKey = env.AI_API_KEY
  if (!baseUrl || !apiKey) return null
  return { baseUrl, apiKey, model: env.AI_MODEL || DEFAULT_MODEL }
}
