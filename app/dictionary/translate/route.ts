import { z } from '@/lib/zod'
import { azureTranslatorConfig } from '@/lib/translate/config'
import { translateCached, AzureTranslateError } from '@/lib/translate/azure'
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
  // 5,000 characters, the same ceiling Google Translate's web page uses. Azure accepts
  // 50,000 per request, so the limit here is the free tier's 2 million characters a
  // month: at 5,000 that is roughly 400 full-length translations, at 50,000 only 40.
  text: z.string().trim().min(1).max(5000),
  from: langCodeSchema.optional(),
  to: z.array(langCodeSchema).min(1).max(4),
})

const TIMEOUT_MS = 10_000

export async function POST(request: Request) {
  const caller = clientKey(request)
  if (caller) {
    const perCaller = rateLimit(caller)
    if (!perCaller.allowed) {
      return Response.json(
        { error: 'Quá nhiều lượt dịch. Thử lại sau ít giây.' },
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

  const cfg = await azureTranslatorConfig()
  if (!cfg) return Response.json({ enabled: false })

  const { text, from, to } = parsed.data
  try {
    const result = await translateCached(cfg, text, from, to, AbortSignal.timeout(TIMEOUT_MS))
    return Response.json({ enabled: true, from: result.from, translations: result.translations })
  } catch (e) {
    if (e instanceof AzureTranslateError) {
      return Response.json({ error: 'Chưa dịch được đoạn này. Thử lại sau ít giây.' }, { status: 502 })
    }
    if (e instanceof DOMException && e.name === 'TimeoutError') {
      return Response.json({ error: 'Chưa dịch được đoạn này. Thử lại sau ít giây.' }, { status: 504 })
    }
    throw e
  }
}
