import { z } from '@/lib/zod'
import type { LangCode } from '@/lib/languages'
import type { AzureTranslatorConfig } from './config'

/**
 * One call to Azure AI Translator's `/translate` endpoint. Measured against the live
 * endpoint: `to=en&to=es&to=zh-Hans` in a single request answers every target language at
 * once, so a caller must never loop over languages -- that is `p_limit` requests instead
 * of one.
 *
 * Azure spells Chinese `zh-Hans`; this project spells it `zh`. Every language crossing the
 * boundary goes through toAzureLang/fromAzureLang.
 */

/** The dictionary's three languages plus Vietnamese, the direction this layer translates
 *  from and to. lib/languages.ts only models the three the dictionary indexes. */
export type TranslateLangCode = LangCode | 'vi'

const TO_AZURE: Record<TranslateLangCode, string> = { en: 'en', es: 'es', zh: 'zh-Hans', vi: 'vi' }

function toAzureLang(code: TranslateLangCode): string {
  return TO_AZURE[code]
}

function fromAzureLang(code: string): TranslateLangCode | null {
  const mapped = code === 'zh-Hans' ? 'zh' : code
  return mapped === 'en' || mapped === 'es' || mapped === 'zh' || mapped === 'vi' ? mapped : null
}

const azureResponseSchema = z.array(z.object({
  detectedLanguage: z.object({ language: z.string(), score: z.number() }).optional(),
  translations: z.array(z.object({ text: z.string(), to: z.string() })),
})).min(1)

/** Azure refused, timed out, or answered something that is not the documented shape. */
export class AzureTranslateError extends Error {}

export interface TranslateResult {
  /** The source language: echoed back when given, or Azure's detected language (mapped
   *  through fromAzureLang, or left as Azure's own code when it names a language this
   *  project has no code for) when `from` was omitted. */
  from: TranslateLangCode | string
  translations: Partial<Record<TranslateLangCode, string>>
}

export async function translateText(
  cfg: AzureTranslatorConfig,
  text: string,
  from: TranslateLangCode | undefined,
  to: TranslateLangCode[],
  signal?: AbortSignal,
): Promise<TranslateResult> {
  const params = new URLSearchParams({ 'api-version': '3.0' })
  if (from) params.set('from', toAzureLang(from))
  for (const t of to) params.append('to', toAzureLang(t))

  const res = await fetch(`${cfg.endpoint}/translate?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': cfg.key,
      'Ocp-Apim-Subscription-Region': cfg.region,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify([{ Text: text }]),
    signal,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new AzureTranslateError(
      `Azure Translator returned HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
    )
  }

  const parsed = azureResponseSchema.safeParse(await res.json())
  if (!parsed.success) throw new AzureTranslateError('unreadable response body')
  const [entry] = parsed.data

  const translations: Partial<Record<TranslateLangCode, string>> = {}
  for (const t of entry.translations) {
    const lang = fromAzureLang(t.to)
    if (lang) translations[lang] = t.text
  }

  const detected = entry.detectedLanguage ? fromAzureLang(entry.detectedLanguage.language) : null
  return { from: detected ?? from ?? entry.detectedLanguage?.language ?? '', translations }
}
