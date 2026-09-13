import { aiConfig } from '@/lib/ai/config'
import { askJson, AiUnavailableError } from '@/lib/ai/client'
import { ERASED_TASKS, isTaskName } from '@/lib/ai/tasks'
import { z } from 'zod'
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

// Two budgets, because the per-address one is conditional and this endpoint
// spends money.
//
// `clientKey` returns null unless TRUST_PROXY_HEADER is set, since a caller can
// write whatever it likes into x-forwarded-for. That is correct, and it means
// the per-address limit does not run at all on a bare `next start` or on any
// deployment that has not set the flag -- measured: 25 consecutive POSTs, none
// refused. The search route survives that because `createColdQueryLimiter`
// backs it up without needing to know who is asking; this route had no such
// second line, so a curl loop against a public POST ran up a model bill until
// somebody looked at a dashboard.
//
// The global budget is that second line. It is deliberately blunt -- one bucket
// for everyone -- because a cap that occasionally inconveniences a real user is
// better than no cap on spending. It sits above the per-address limit so a
// deployment behind a proxy still gets fair sharing underneath it.
const CALLS_PER_MINUTE = 20
const rateLimit = createRateLimiter({ limit: CALLS_PER_MINUTE, windowMs: 60_000 })

const GLOBAL_CALLS_PER_MINUTE = 60
const globalBudget = createRateLimiter({ limit: GLOBAL_CALLS_PER_MINUTE, windowMs: 60_000 })

/** The envelope, parsed rather than cast. `JSON.parse('null')` succeeds, so the
 *  try/catch around `request.json()` does not stop `null` reaching the field
 *  reads; casting it and dereferencing `.task` threw, and the handler answered
 *  500 to what is an ordinary bad request. */
const envelopeSchema = z.object({ task: z.unknown(), input: z.unknown() })

/** A model call that has not answered by now is not worth the user's wait. */
const TIMEOUT_MS = 30_000

export async function GET() {
  return Response.json({ enabled: aiConfig() !== null })
}

export async function POST(request: Request) {
  const cfg = aiConfig()
  if (!cfg) return Response.json({ error: 'Trợ lý AI chưa được cấu hình.' }, { status: 503 })

  const caller = clientKey(request)
  const allowance = caller ? rateLimit(caller) : globalBudget('all')
  if (!allowance.allowed) {
    return Response.json(
      { error: 'Bạn đang dùng trợ lý quá nhanh. Thử lại sau ít giây.' },
      { status: 429, headers: { 'Retry-After': String(allowance.retryAfterSeconds) } },
    )
  }
  // The global cap applies either way: identified callers are also spending.
  if (caller && !globalBudget('all').allowed) {
    return Response.json(
      { error: 'Trợ lý đang bận. Thử lại sau ít giây.' },
      { status: 429, headers: { 'Retry-After': '60' } },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 400 })
  }

  const envelope = envelopeSchema.safeParse(body)
  if (!envelope.success || !isTaskName(envelope.data.task)) {
    return Response.json({ error: 'Không có tác vụ này.' }, { status: 400 })
  }

  const spec = ERASED_TASKS[envelope.data.task]
  const prompt = spec.promptFor(envelope.data.input)
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
