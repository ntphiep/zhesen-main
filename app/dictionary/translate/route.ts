import { after } from 'next/server'
import { z } from '@/lib/zod'
import { azureTranslatorConfig } from '@/lib/translate/config'
import { translateCached, AzureTranslateError } from '@/lib/translate/azure'
import { MONTHLY_BUDGET, monthUsage, recordUsage } from '@/lib/translate/usage'
import { clientKey, createRateLimiter } from '@/lib/http/rateLimit'
import { createClient } from '@/lib/supabase/server'
import { permanentUser } from '@/lib/auth/guard'

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
  // 5,000 characters, the same ceiling Google Translate's web page uses, for an account.
  // Azure accepts 50,000 per request; the limit here is MONTHLY_BUDGET.
  text: z.string().trim().min(1).max(5000),
  from: langCodeSchema.optional(),
  to: z.array(langCodeSchema).min(1).max(4),
})

const TIMEOUT_MS = 10_000

/** Without an account a passage stops at the word list's own ceiling, since anyone can
 *  spend the shared month without one. */
const GUEST_MAX_CHARS = 1000

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
  // Outside a request (tests) there are no cookies: no account, and no count to read.
  const supabase = await createClient().catch(() => null)
  if (text.length > GUEST_MAX_CHARS && !(supabase && (await permanentUser(supabase)))) {
    return Response.json(
      { error: 'Chưa dịch được đoạn dài hơn 1.000 ký tự. Đăng nhập để dịch tới 5.000 ký tự.' },
      { status: 403 },
    )
  }
  const used = supabase ? await monthUsage(supabase) : null
  if (used !== null && used + text.length * to.length > MONTHLY_BUDGET) {
    return Response.json(
      { error: 'Chưa dịch được đoạn văn trong tháng này. Tra từng từ một.' },
      { status: 429 },
    )
  }
  try {
    const result = await translateCached(cfg, text, from, to, AbortSignal.timeout(TIMEOUT_MS))
    if (supabase && result.charged > 0) after(() => recordUsage(supabase, result.charged))
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
