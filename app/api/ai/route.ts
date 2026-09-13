import { aiConfig } from '@/lib/ai/config'
import { askJson, AiUnavailableError } from '@/lib/ai/client'
import { ERASED_TASKS, isTaskName } from '@/lib/ai/tasks'
import { clientKey, createRateLimiter } from '@/lib/http/rateLimit'

/**
 * The single entry point for the assistant features.
 *
 * It exists so the model key stays on the server. It is also where the cost is
 * bounded: a model call is the most expensive thing this app can do per click,
 * far more than a Supabase read, so the budget here is deliberately much smaller
 * than the search route's.
 *
 * GET reports whether the feature is configured at all, so the browser can leave
 * the buttons out rather than offer something that will fail. A deployment that
 * cannot reach the router -- it lives on a private network -- is a supported
 * state, not a broken one.
 */

// A learner enriching words by hand cannot outpace this; a script can, and a
// script is what would run up the bill. Per address where the deployment can
// identify one, which is the same condition the search route uses.
const CALLS_PER_MINUTE = 20
const rateLimit = createRateLimiter({ limit: CALLS_PER_MINUTE, windowMs: 60_000 })

/** A model call that has not answered by now is not worth the user's wait. */
const TIMEOUT_MS = 30_000

export async function GET() {
  return Response.json({ enabled: aiConfig() !== null })
}

export async function POST(request: Request) {
  const cfg = aiConfig()
  if (!cfg) return Response.json({ error: 'Trợ lý AI chưa được cấu hình.' }, { status: 503 })

  const caller = clientKey(request)
  if (caller) {
    const allowance = rateLimit(caller)
    if (!allowance.allowed) {
      return Response.json(
        { error: 'Bạn đang dùng trợ lý quá nhanh. Thử lại sau ít giây.' },
        { status: 429, headers: { 'Retry-After': String(allowance.retryAfterSeconds) } },
      )
    }
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 400 })
  }

  const envelope = body as { task?: unknown; input?: unknown }
  if (!isTaskName(envelope.task)) {
    return Response.json({ error: 'Không có tác vụ này.' }, { status: 400 })
  }

  const spec = ERASED_TASKS[envelope.task]
  const prompt = spec.promptFor(envelope.input)
  if (prompt === null) {
    return Response.json({ error: 'Dữ liệu đầu vào không hợp lệ.' }, { status: 400 })
  }

  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  try {
    const data = await askJson(cfg, {
      system: spec.system,
      user: prompt,
      parse: spec.parseOutput,
      maxTokens: spec.maxTokens,
      signal: timeout,
    })
    return Response.json({ data })
  } catch (e) {
    if (e instanceof AiUnavailableError) {
      return Response.json({ error: 'Trợ lý không trả lời được lúc này.' }, { status: 502 })
    }
    if (e instanceof DOMException && e.name === 'TimeoutError') {
      return Response.json({ error: 'Trợ lý phản hồi quá chậm.' }, { status: 504 })
    }
    throw e
  }
}
