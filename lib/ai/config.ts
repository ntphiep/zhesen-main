import { runtimeEnv } from '@/lib/secrets'

/**
 * Where the assistant gets its model: SSM first, then the env var (lib/secrets.ts).
 * Server-only: no `NEXT_PUBLIC_` here, so the key never reaches a bundle, and the browser
 * goes through `app/api/ai/route.ts`. `aiConfig()`
 * returning null is a supported state -- the router is on a private network, so a
 * deployment that cannot reach it serves the dictionary with the assistant buttons absent.
 */
export interface AiEndpoint {
  /** Base URL including the version segment, e.g. http://host:20128/v1 */
  baseUrl: string
  apiKey: string
  model: string
}

/** 9router, then OmniRoute when 9router fails (lib/ai/client.ts). */
export interface AiConfig extends AiEndpoint {
  fallback?: AiEndpoint
}

/** Default model: the cheap fast tier of the family the project owner pays for. */
const DEFAULT_MODEL = 'ag/gemini-3.8-flash'
/** The OmniRoute combo the assistant asks for; its members are set in OmniRoute's dashboard. */
export const FALLBACK_MODEL = 'zhesen'

/** Each router the assistant can reach, undefined where its base URL or key is unset. */
export async function aiEndpoints(): Promise<{ nineRouter?: AiEndpoint; omniRoute?: AiEndpoint }> {
  const env = await runtimeEnv()
  const endpoint = (url: string | undefined, apiKey: string | undefined, model: string) => {
    const baseUrl = url?.replace(/\/$/, '')
    return baseUrl && apiKey ? { baseUrl, apiKey, model } : undefined
  }
  return {
    nineRouter: endpoint(env.AI_BASE_URL, env.AI_API_KEY, env.AI_MODEL || DEFAULT_MODEL),
    omniRoute: endpoint(env.AI_FALLBACK_BASE_URL, env.AI_FALLBACK_API_KEY, FALLBACK_MODEL),
  }
}

export async function aiConfig(): Promise<AiConfig | null> {
  const { nineRouter, omniRoute } = await aiEndpoints()
  if (!nineRouter) return omniRoute ?? null
  return omniRoute ? { ...nineRouter, fallback: omniRoute } : nineRouter
}
