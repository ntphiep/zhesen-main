import { revalidateTag } from 'next/cache'
import { aiConfig } from '@/lib/ai/config'
import { azureTranslatorConfig } from '@/lib/translate/config'

/** Every cached dictionary read carries this tag; see lib/dictionary/cached.ts. */
export const LEX_TAG = 'lex'

/** `expire: 0`, not `'max'`: the next request is the admin checking the edit, and `'max'`
 *  would serve it the stale copy (revalidateTag.md in node_modules/next/dist/docs). */
export function flushLex(): void {
  revalidateTag(LEX_TAG, { expire: 0 })
}

export interface Integration {
  label: string
  enabled: boolean
}

/** Whether each outside service is configured, never its values. */
export function integrations(): Integration[] {
  return [
    { label: 'AI assistant', enabled: aiConfig() !== null },
    { label: 'Azure AI Translator', enabled: azureTranslatorConfig() !== null },
    { label: 'Revalidate secret', enabled: Boolean(process.env.REVALIDATE_SECRET) },
  ]
}
