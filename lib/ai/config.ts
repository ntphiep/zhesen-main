/**
 * Where the assistant features get their model, and whether they exist at all.
 *
 * Server-only on purpose: no `NEXT_PUBLIC_` here, so the key never reaches a
 * bundle. Everything the browser wants goes through `app/api/ai/route.ts`.
 *
 * `aiConfig()` returning null is a supported state, not an error. The router this
 * project points at lives on a private network, so a deployment that cannot reach
 * it should serve the dictionary exactly as before with the assistant buttons
 * absent -- see `isAiEnabled` in the route and the `enabled` flag the client reads.
 */
export interface AiConfig {
  /** Base URL including the version segment, e.g. http://host:20128/v1 */
  baseUrl: string
  apiKey: string
  model: string
}

/** Default model: the cheap fast tier of the family the project owner pays for. */
const DEFAULT_MODEL = 'ag/gemini-3.8-flash'

export function aiConfig(): AiConfig | null {
  const baseUrl = process.env.AI_BASE_URL?.trim().replace(/\/$/, '')
  const apiKey = process.env.AI_API_KEY?.trim()
  if (!baseUrl || !apiKey) return null
  return { baseUrl, apiKey, model: process.env.AI_MODEL?.trim() || DEFAULT_MODEL }
}
