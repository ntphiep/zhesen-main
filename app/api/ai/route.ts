import { aiConfig } from '@/lib/ai/config'
import type { AiConfig } from '@/lib/ai/config'
import { askJson, streamText, AiUnavailableError } from '@/lib/ai/client'
import { ERASED_TASKS, isTaskName, type ErasedTask } from '@/lib/ai/tasks'
import { z } from '@/lib/zod'
import { clientKey, createRateLimiter } from '@/lib/http/rateLimit'
import { createClient } from '@/lib/supabase/server'
import { permanentUser } from '@/lib/auth/guard'

/**
 * The single entry point for the assistant features, so the model key stays on
 * the server.
 *
 * Only a permanent account may use it, the owner's decision: GET answers
 * `enabled: true` only when the model is configured AND the caller has one, so the
 * browser leaves the buttons out for everyone else, and POST refuses them. A
 * deployment that cannot reach the router -- it lives on a private network -- is a
 * supported state, not a broken one.
 */

// Two budgets: per-address, and a global one as a backstop for deployments where
// `clientKey` cannot name the caller (see `forwardedForIsTrusted` in
// lib/http/rateLimit.ts).
//
// KNOWN CEILING: both counters live in this process's memory, so on a platform
// that runs several instances the real limit is the number below times the
// number of instances. The route now sits behind a permanent account, so a caller
// must first register one; move the global counter to a shared store if accounts
// ever start being farmed for it.
const CALLS_PER_MINUTE = 20
let rateLimit = createRateLimiter({ limit: CALLS_PER_MINUTE, windowMs: 60_000 })

const GLOBAL_CALLS_PER_MINUTE = 60
let globalBudget = createRateLimiter({ limit: GLOBAL_CALLS_PER_MINUTE, windowMs: 60_000 })

/** Start both budgets over. For tests, which reuse the module and would
 *  otherwise have one case's flood decide the next case's answer -- the same
 *  reason `resetDetailCache` exists. */
export function resetAiBudgets(): void {
  rateLimit = createRateLimiter({ limit: CALLS_PER_MINUTE, windowMs: 60_000 })
  globalBudget = createRateLimiter({ limit: GLOBAL_CALLS_PER_MINUTE, windowMs: 60_000 })
}

/** The envelope, parsed rather than cast. `JSON.parse('null')` succeeds, so the
 *  try/catch around `request.json()` does not stop `null` reaching the field
 *  reads; casting it and dereferencing `.task` threw, and the handler answered
 *  500 to what is an ordinary bad request. */
const envelopeSchema = z.object({ task: z.unknown(), input: z.unknown() })

/** A model call that has not answered by now is not worth the user's wait. */
const TIMEOUT_MS = 30_000

/** The answer depends on the caller's session, so no cache may keep it. */
const PRIVATE = { 'Cache-Control': 'private, no-store' }

const UNAVAILABLE = 'Trợ lý chưa trả lời được. Thử lại sau.'

/** What the browser is told about a failed model call, or null for a failure that
 *  is not the model's and should surface as one. */
function failure(e: unknown): { error: string; status: number } | null {
  if (e instanceof AiUnavailableError) return { error: UNAVAILABLE, status: 502 }
  if (e instanceof DOMException && e.name === 'TimeoutError') {
    return { error: 'Trợ lý trả lời quá lâu. Thử lại sau.', status: 504 }
  }
  return null
}

/**
 * A plain-text task, answered as NDJSON: `{"text"}` per piece as the model writes it,
 * then one `{"data"}` checked against the task's output schema, or one `{"error"}`.
 * The status is already 200 by the time the model can fail, hence the error line.
 */
async function streamed(
  cfg: AiConfig, spec: ErasedTask, fromText: (text: string) => unknown, user: string,
  signal: AbortSignal,
): Promise<Response> {
  // The browser going away cancels the body; that has to stop the model call too.
  const gone = new AbortController()
  const pieces = await streamText(cfg, {
    system: spec.system, user, maxTokens: spec.maxTokens, signal: AbortSignal.any([signal, gone.signal]),
  })
  const encoder = new TextEncoder()
  const line = (value: unknown) => encoder.encode(`${JSON.stringify(value)}\n`)
  let whole = ''

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await pieces.next()
        if (!done) {
          whole += value
          controller.enqueue(line({ text: value }))
          return
        }
        const data = spec.parseOutput(fromText(whole))
        controller.enqueue(line(data === null ? { error: UNAVAILABLE } : { data }))
      } catch (e) {
        if (gone.signal.aborted) return
        const f = failure(e)
        if (!f) throw e
        controller.enqueue(line({ error: f.error }))
      }
      controller.close()
    },
    cancel() {
      gone.abort()
    },
  })
  return new Response(body, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', ...PRIVATE } })
}

async function signedIn(): Promise<boolean> {
  return (await permanentUser(await createClient())) !== null
}

export async function GET() {
  const enabled = (await signedIn()) && (await aiConfig()) !== null
  return Response.json({ enabled }, { headers: PRIVATE })
}

export async function POST(request: Request) {
  if (!(await signedIn())) return Response.json({ error: 'Đăng nhập để dùng trợ lý.' }, { status: 401 })
  const cfg = await aiConfig()
  if (!cfg) return Response.json({ error: 'Chưa bật trợ lý.' }, { status: 503 })

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

  // Budget is spent here, not on arrival. The global bucket is one bucket for
  // everyone, so charging a request that never reaches the model turned it into
  // a lever: sixty pieces of junk a minute cost the sender nothing and answered
  // every real user with "Trợ lý đang bận". Only a request that is about to cost
  // something takes a slot. Malformed input is still refused instantly above.
  const caller = clientKey(request)
  const allowance = caller ? rateLimit(caller) : globalBudget('all')
  if (!allowance.allowed) {
    return Response.json(
      { error: 'Quá nhiều câu hỏi. Thử lại sau ít giây.' },
      { status: 429, headers: { 'Retry-After': String(allowance.retryAfterSeconds) } },
    )
  }
  if (caller && !globalBudget('all').allowed) {
    return Response.json(
      { error: 'Trợ lý đang bận. Thử lại sau ít giây.' },
      { status: 429, headers: { 'Retry-After': '60' } },
    )
  }

  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  try {
    if (spec.fromText) return await streamed(cfg, spec, spec.fromText, prompt, timeout)
    const data = await askJson(cfg, {
      system: spec.system,
      user: prompt,
      parse: spec.parseOutput,
      maxTokens: spec.maxTokens,
      signal: timeout,
    })
    return Response.json({ data })
  } catch (e) {
    const f = failure(e)
    if (!f) throw e
    return Response.json({ error: f.error }, { status: f.status })
  }
}
