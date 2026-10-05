import { aiConfig } from '@/lib/ai/config'
import type { AiConfig } from '@/lib/ai/config'
import { askJsonFrom, streamText, AiUnavailableError } from '@/lib/ai/client'
import { prepareJob, type Job } from '@/lib/ai/jobs'
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

const UNAVAILABLE = 'AI chưa trả lời được. Thử lại sau.'

/** What the browser is told about a failed model call, or null for a failure that
 *  is not the model's and should surface as one. */
function failure(e: unknown): { error: string; status: number } | null {
  if (e instanceof AiUnavailableError) return { error: UNAVAILABLE, status: 502 }
  if (e instanceof DOMException && e.name === 'TimeoutError') {
    return { error: 'AI trả lời quá lâu. Thử lại sau.', status: 504 }
  }
  return null
}

/** What went wrong as a fixed label. The message itself can carry the router's error body,
 *  which may echo the learner's text. */
const ERROR_CLASSES: [RegExp, string | ((m: RegExpMatchArray) => string)][] = [
  [/model returned HTTP (\d+)/, (m) => `http_${m[1]}`],
  [/no answer within/, 'slow_router'],
  [/answer cut at max_tokens/, 'cut'],
  [/malformed JSON|no JSON|unreadable response body/, 'malformed'],
  [/did not match the task schema/, 'schema'],
  [/stream ended|error event/, 'stream'],
]

function errorClass(e: unknown): string {
  if (e instanceof DOMException) return e.name
  if (!(e instanceof AiUnavailableError)) return 'unknown'
  return e.message.split('; fallback: ').map((part) => {
    for (const [pattern, label] of ERROR_CLASSES) {
      const m = part.match(pattern)
      if (m) return typeof label === 'string' ? label : label(m)
    }
    return 'unavailable'
  }).join('+')
}

/** One line per failed model call, so a dead router shows in the logs. Task, router,
 *  answered status and an error class only: never the prompt, the input, the key or the
 *  router's error body. */
function logFailure(task: string, e: unknown, status: number): void {
  console.error('ai failed', JSON.stringify({
    task,
    router: e instanceof AiUnavailableError ? e.router ?? null : null,
    status,
    error: errorClass(e),
  }))
}

/**
 * A plain-text task, answered as NDJSON: `{"text"}` per piece as the model writes it,
 * then one `{"data"}` checked against the task's output schema, or one `{"error"}`.
 * The status is already 200 by the time the model can fail, hence the error line.
 */
async function streamed(
  task: string, cfg: AiConfig, spec: ErasedTask, fromText: (text: string) => unknown, job: Job,
  signal: AbortSignal,
): Promise<Response> {
  // The browser going away cancels the body; that has to stop the model call too.
  const gone = new AbortController()
  const pieces = await streamText(cfg, {
    system: job.system, user: job.user, messages: job.messages, maxTokens: spec.maxTokens,
    signal: AbortSignal.any([signal, gone.signal]),
  })
  const encoder = new TextEncoder()
  const line = (value: unknown) => encoder.encode(`${JSON.stringify(value)}\n`)
  const cap = spec.maxChars ?? Infinity
  let whole = ''

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await pieces.next()
        if (!done) {
          const piece = value.slice(0, cap - whole.length)
          whole += piece
          controller.enqueue(line({ text: piece }))
          if (whole.length < cap) return
          // The schema would refuse anything longer: stop the model and answer with what was sent.
          gone.abort()
        }
        const data = spec.parseOutput(fromText(whole))
        if (data === null) logFailure(task, new Error('reply did not match the task schema'), 200)
        controller.enqueue(line(data === null ? { error: UNAVAILABLE } : { data }))
      } catch (e) {
        if (gone.signal.aborted) return
        const f = failure(e)
        if (!f) throw e
        logFailure(task, e, 200)
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

/** One call off the account's daily allowance (supabase/migrations/0180_ai_daily_cap.sql),
 *  false once it is spent. A check that fails lets the call through: the minute budgets
 *  above still hold, and the line in the log says the cap is not counting. */
async function takeDailyCall(): Promise<boolean> {
  try {
    const { data, error } = await (await createClient()).rpc('ai_take_call')
    if (error) throw new Error(error.message)
    return z.boolean().parse(data)
  } catch (e) {
    console.error('ai cap check failed', e instanceof Error ? e.message : String(e))
    return true
  }
}

export async function GET() {
  const enabled = (await signedIn()) && (await aiConfig()) !== null
  return Response.json({ enabled }, { headers: PRIVATE })
}

export async function POST(request: Request) {
  if (!(await signedIn())) return Response.json({ error: 'Đăng nhập để dùng AI.' }, { status: 401 })
  const cfg = await aiConfig()
  if (!cfg) return Response.json({ error: 'Chưa bật AI.' }, { status: 503 })

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

  const task = envelope.data.task
  const spec = ERASED_TASKS[task]
  const invalid = () => Response.json({ error: 'Dữ liệu đầu vào không hợp lệ.' }, { status: 400 })
  if (spec.promptFor(envelope.data.input) === null) return invalid()

  // Budget is spent here, not on arrival. The global bucket is one bucket for
  // everyone, so charging a request that never reaches the model turned it into
  // a lever: sixty pieces of junk a minute cost the sender nothing and answered
  // every real user with "AI đang bận". Only a request that is about to cost
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
      { error: 'AI đang bận. Thử lại sau ít giây.' },
      { status: 429, headers: { 'Retry-After': '60' } },
    )
  }
  if (!(await takeDailyCall())) {
    return Response.json({ error: 'Hết lượt hỏi AI hôm nay. Thử lại vào ngày mai.' }, { status: 429 })
  }

  // After the budgets: the server step reads the dictionary and the learner's own rows, which
  // a capped account must not cost. A stored answer still spends the call it took.
  const job = await prepareJob(task, envelope.data.input)
  if (job === null) return invalid()
  if (job.cached !== undefined) return Response.json({ data: job.cached }, { headers: PRIVATE })

  // The browser leaving, Dừng included, stops the model call as the deadline does.
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(TIMEOUT_MS)])
  try {
    if (spec.fromText) return await streamed(task, cfg, spec, spec.fromText, job, signal)
    const { value, model } = await askJsonFrom(cfg, {
      system: job.system,
      user: job.user,
      messages: job.messages,
      parse: job.parse,
      maxTokens: spec.maxTokens,
      signal,
    })
    return Response.json({ data: job.finish ? await job.finish(value, model) : value })
  } catch (e) {
    // Next aborts request.signal with ResponseAborted once the tab is gone: nobody to answer.
    if (request.signal.aborted) return new Response(null, { status: 499 })
    const f = failure(e)
    if (!f) throw e
    logFailure(task, e, f.status)
    return Response.json({ error: f.error }, { status: f.status })
  }
}
