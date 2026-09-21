import { z } from '@/lib/zod'
import { azureTranslatorConfig } from '@/lib/translate/config'
import { translateText, AzureTranslateError, type TranslateLangCode } from '@/lib/translate/azure'
import { clientKey, createRateLimiter } from '@/lib/http/rateLimit'

/**
 * Whole-passage machine translation between Vietnamese and the dictionary's three
 * languages, backed by Azure AI Translator.
 *
 * POST, not GET, for the same reason as `dictionary/text/lookup`: the body is a passage a
 * learner pasted, too long for a query string and not repeated often enough for a
 * route-level cache keyed on it to ever hit. `azureTranslatorConfig()` returning null is a
 * supported state, like the assistant: this answers 200 `{ enabled: false }` so the UI can
 * hide the block rather than show an error.
 */

// Same tier as the `text/lookup` route: one call per pasted passage, single figures a
// minute for a real learner.
const REQUESTS_PER_MINUTE = 30
const rateLimit = createRateLimiter({ limit: REQUESTS_PER_MINUTE, windowMs: 60_000 })

const langCodeSchema = z.enum(['en', 'es', 'zh', 'vi'])

// The same ceiling as `dictionary/text/lookup`: both read one pasted passage.
const requestBody = z.object({
  text: z.string().trim().min(1).max(1000),
  from: langCodeSchema.optional(),
  to: z.array(langCodeSchema).min(1).max(4),
})

const TIMEOUT_MS = 10_000

// Lives inside one serverless instance's memory, not a shared store: it saves the repeat
// within a warm instance and nothing fleet-wide, which is deliberate -- this route's quota
// (about two million characters a month) is nowhere near what a real cache would be
// needed for. Same eviction shape as components/search/LookupPanel.tsx's client-side
// cache: Map insertion order is age, so the first key is the oldest.
const CACHE_LIMIT = 200
const cache = new Map<string, string>()

function cacheKey(from: string, to: TranslateLangCode, text: string): string {
  return `${from}:${to}:${text}`
}

function cacheSet(key: string, value: string): void {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next()
    if (!oldest.done) cache.delete(oldest.value)
  }
  cache.set(key, value)
}

export async function POST(request: Request) {
  const caller = clientKey(request)
  if (caller) {
    const perCaller = rateLimit(caller)
    if (!perCaller.allowed) {
      return Response.json(
        { error: 'Đang có quá nhiều lượt dịch. Vui lòng thử lại sau ít giây.' },
        { status: 429, headers: { 'Retry-After': String(perCaller.retryAfterSeconds) } },
      )
    }
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 400 })
  }

  const parsed = requestBody.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Đoạn văn bản quá dài hoặc để trống.' }, { status: 400 })
  }

  const cfg = azureTranslatorConfig()
  if (!cfg) return Response.json({ enabled: false })

  const { text, from, to } = parsed.data
  const normalized = text.trim()
  const fromKey = from ?? ''

  const translations: Partial<Record<TranslateLangCode, string>> = {}
  const missing: TranslateLangCode[] = []
  for (const lang of to) {
    const hit = cache.get(cacheKey(fromKey, lang, normalized))
    if (hit !== undefined) translations[lang] = hit
    else missing.push(lang)
  }

  let resolvedFrom: string = from ?? ''

  if (missing.length > 0) {
    try {
      const result = await translateText(cfg, normalized, from, missing, AbortSignal.timeout(TIMEOUT_MS))
      resolvedFrom = result.from
      Object.assign(translations, result.translations)
      for (const lang of missing) {
        const value = result.translations[lang]
        if (value) cacheSet(cacheKey(fromKey, lang, normalized), value)
      }
    } catch (e) {
      if (e instanceof AzureTranslateError) {
        return Response.json({ error: 'Dịch vụ dịch không phản hồi được lúc này.' }, { status: 502 })
      }
      if (e instanceof DOMException && e.name === 'TimeoutError') {
        return Response.json({ error: 'Dịch vụ dịch phản hồi quá chậm.' }, { status: 504 })
      }
      throw e
    }
  }

  return Response.json({ enabled: true, from: resolvedFrom, translations })
}
