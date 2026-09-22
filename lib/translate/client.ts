import { z } from '@/lib/zod'
import type { TranslateLangCode } from './azure'

/**
 * Browser side of `POST /dictionary/translate`. The key is server-only, so every call goes
 * through the route, which also holds the cache and the per-address budget.
 */

const translateResponse = z.discriminatedUnion('enabled', [
  z.object({ enabled: z.literal(false) }),
  z.object({
    enabled: z.literal(true),
    from: z.string(),
    // Spelled out rather than `z.record(z.enum(...), ...)`, which in Zod 4 requires every
    // key of the enum to be present. The route answers only the languages that were asked
    // for, so a one-language request failed to parse and the panel showed a refusal.
    translations: z.object({
      en: z.string().optional(),
      es: z.string().optional(),
      zh: z.string().optional(),
      vi: z.string().optional(),
    }),
  }),
])

/** `disabled` is an outcome, not an error: a deployment with no Azure key answers it and
 *  the panel hides the block instead of showing one that only fails. */
export type TranslateOutcome =
  | {
      status: 'ok'
      /** What Azure detected, or echoed back when the caller named it. Azure's own code
       *  when it names a language this project has no code for. */
      from: string
      translations: Partial<Record<TranslateLangCode, string>>
    }
  | { status: 'disabled' }
  | { status: 'refused'; message: string }

const REFUSED_MESSAGE = 'Chưa dịch được đoạn này. Vui lòng thử lại sau ít giây.'

/** `from` is optional on purpose. Asserting it was measured wrong on real input: Chinese
 *  pasted into the Vietnamese box and sent as `from: 'vi'` came back untranslated, and
 *  Spanish came back as itself, while the same text with Azure detecting the language
 *  answered correctly. The box the reader types in decides which dictionary to search; it
 *  does not decide what language they pasted. */
export async function fetchTranslation(
  text: string,
  from: TranslateLangCode | undefined,
  to: readonly TranslateLangCode[],
  signal?: AbortSignal,
): Promise<TranslateOutcome> {
  const res = await fetch('/dictionary/translate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(from ? { text, from, to } : { text, to }),
    signal,
  })
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const message = (body as { error?: unknown } | null)?.error
    return { status: 'refused', message: typeof message === 'string' ? message : REFUSED_MESSAGE }
  }
  const parsed = translateResponse.safeParse(body)
  if (!parsed.success) return { status: 'refused', message: REFUSED_MESSAGE }
  if (!parsed.data.enabled) return { status: 'disabled' }
  return { status: 'ok', from: parsed.data.from, translations: parsed.data.translations }
}
