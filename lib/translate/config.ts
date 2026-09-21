/**
 * Where the translate layer gets its Azure AI Translator credentials. Server-only, same
 * shape as lib/ai/config.ts: no `NEXT_PUBLIC_` here, so the key never reaches a bundle.
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

export function azureTranslatorConfig(): AzureTranslatorConfig | null {
  const key = process.env.AZURE_TRANSLATOR_KEY?.trim()
  if (!key) return null
  const endpoint = process.env.AZURE_TRANSLATOR_ENDPOINT?.trim().replace(/\/$/, '') || DEFAULT_ENDPOINT
  const region = process.env.AZURE_TRANSLATOR_REGION?.trim() || DEFAULT_REGION
  return { endpoint, key, region }
}
