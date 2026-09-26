import { runtimeEnv } from '@/lib/secrets'

/**
 * Where the translate layer gets its Azure AI Translator credentials: SSM first, then the
 * env var (lib/secrets.ts). Server-only, same shape as lib/ai/config.ts: no `NEXT_PUBLIC_`
 * here, so the key never reaches a bundle.
 * `azureTranslatorConfig()` returning null is a supported state, not an error -- the route
 * answers `{ enabled: false }` and the UI hides the translate block rather than show one
 * that only fails.
 */
export interface AzureTranslatorConfig {
  /** e.g. https://api.cognitive.microsofttranslator.com */
  endpoint: string
  key: string
  /** Ocp-Apim-Subscription-Region. Required by Azure even for a global resource. */
  region: string
}

const DEFAULT_ENDPOINT = 'https://api.cognitive.microsofttranslator.com'
const DEFAULT_REGION = 'eastasia'

export async function azureTranslatorConfig(): Promise<AzureTranslatorConfig | null> {
  const env = await runtimeEnv()
  const key = env.AZURE_TRANSLATOR_KEY
  if (!key) return null
  const endpoint = env.AZURE_TRANSLATOR_ENDPOINT?.replace(/\/$/, '') || DEFAULT_ENDPOINT
  const region = env.AZURE_TRANSLATOR_REGION || DEFAULT_REGION
  return { endpoint, key, region }
}
