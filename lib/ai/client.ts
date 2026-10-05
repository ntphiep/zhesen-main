import { z } from '@/lib/zod'
import type { AiConfig, AiEndpoint } from './config'

/**
 * Requests to the model: `askJson` answers validated JSON, `streamText` plain text in
 * pieces. Both response shapes must stay handled: `POST /messages` with `stream: false`
 * answers an OpenAI `chat.completion` body while the same path answers Anthropic-shaped
 * events when streaming (measured against the router on 2026-09-14). `extractJson` also
 * unwraps a ```json fence.
 */

const openAiShape = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }), finish_reason: z.string().nullish() })).min(1),
})
const anthropicShape = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })).min(1),
  stop_reason: z.string().nullish(),
})

/** The server-sent events that matter; only `message_stop` proves the stream ended. A
 *  `max_tokens` stop is kept like the route's character cap: the learner already saw it. */
const streamEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('content_block_delta'), delta: z.object({ type: z.string(), text: z.string().optional() }) }),
  z.object({ type: z.literal('message_stop') }),
  z.object({ type: z.literal('error') }),
])

/** The model refused, timed out, or answered something that is not the shape asked for.
 *  `router` names the router that gave the last answer, for the route's log line. */
export class AiUnavailableError extends Error {
  constructor(message: string, readonly router?: string) {
    super(message)
  }
}

/** A router as a log line names it: its host, never its key. */
export function routerName(e: AiEndpoint): string {
  try {
    return new URL(e.baseUrl).host
  } catch {
    return 'unknown'
  }
}

/** The text of a one-body reply, and whether the token limit cut it. */
function messageText(body: unknown): { text: string; cut: boolean } {
  const openai = openAiShape.safeParse(body)
  if (openai.success) {
    const choice = openai.data.choices[0]
    return { text: choice.message.content, cut: choice.finish_reason === 'length' }
  }
  const anthropic = anthropicShape.safeParse(body)
  if (anthropic.success) {
    const text = anthropic.data.content.find((c) => c.type === 'text')?.text
    if (text) return { text, cut: anthropic.data.stop_reason === 'max_tokens' }
  }
  throw new AiUnavailableError('unreadable response body')
}

/** Unwrap a ```json fence and drop anything outside the outermost object. */
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = (fenced ? fenced[1] : text).trim()
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end <= start) throw new AiUnavailableError('no JSON in the response')
  return body.slice(start, end + 1)
}

export interface TextOptions {
  system: string
  user: string
  maxTokens: number
  /** Aborts the request; the caller owns the deadline. */
  signal?: AbortSignal
}

export interface AskOptions<T> extends TextOptions {
  /** Validates the model's JSON. Returns null when it is not the shape asked for.
   *  A function rather than a schema so the task registry can hand over an
   *  already-narrowed validator instead of a union of schemas. */
  parse: (value: unknown) => T | null
}

/** How long the first router has to answer before the fallback is asked. The caller's
 *  deadline covers both (30 s in app/api/ai/route.ts), so the fallback keeps the rest. */
export const FIRST_ROUTER_MS = 15_000

/** The first router, then the fallback when the first refuses, cannot be reached or has
 *  not answered within FIRST_ROUTER_MS. A caller's own abort never falls through. Also
 *  names the router that answered. */
async function send(cfg: AiConfig, opts: TextOptions, stream: boolean): Promise<{ res: Response; from: AiEndpoint }> {
  const fallback = cfg.fallback
  if (!fallback) return { res: await sendTo(cfg, opts, stream), from: cfg }
  try {
    return { res: await sendTo(cfg, opts, stream, FIRST_ROUTER_MS), from: cfg }
  } catch (e) {
    if (opts.signal?.aborted) throw e
    const res = await sendTo(fallback, opts, stream).catch((second: unknown) => {
      if (opts.signal?.aborted) throw second
      throw new AiUnavailableError(`${message(e)}; fallback: ${message(second)}`, routerName(fallback))
    })
    return { res, from: fallback }
  }
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** `answerMs` bounds the wait for the response headers only, never a stream in progress. */
async function sendTo(cfg: AiEndpoint, opts: TextOptions, stream: boolean, answerMs?: number): Promise<Response> {
  const late = new AbortController()
  const timer = answerMs === undefined ? undefined
    : setTimeout(() => late.abort(new AiUnavailableError(`no answer within ${answerMs / 1000} s`, routerName(cfg))), answerMs)
  try {
    return await request(cfg, opts, stream, opts.signal ? AbortSignal.any([opts.signal, late.signal]) : late.signal)
  } finally {
    clearTimeout(timer)
  }
}

async function request(cfg: AiEndpoint, opts: TextOptions, stream: boolean, signal: AbortSignal): Promise<Response> {
  const res = await fetch(`${cfg.baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.apiKey,
      authorization: `Bearer ${cfg.apiKey}`,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: opts.maxTokens,
      stream,
      system: opts.system,
      messages: [{ role: 'user', content: opts.user }],
    }),
    signal,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new AiUnavailableError(
      `model returned HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`, routerName(cfg),
    )
  }
  return res
}

async function bodyText(res: Response): Promise<{ text: string; cut: boolean }> {
  const body: unknown = await res.json().catch(() => null)
  return messageText(body)
}

/** One router's answer, checked. Every failure names that router. */
async function readJson<T>(res: Response, from: AiEndpoint, parse: (value: unknown) => T | null): Promise<T> {
  const fail = (why: string) => new AiUnavailableError(why, routerName(from))
  let value: unknown
  try {
    const { text, cut } = await bodyText(res)
    // A body cut at max_tokens can still close its braces and parse, minus its tail.
    if (cut) throw fail('answer cut at max_tokens')
    value = JSON.parse(extractJson(text))
  } catch (e) {
    throw fail(e instanceof AiUnavailableError ? e.message : 'malformed JSON in the response')
  }
  const parsed = parse(value)
  if (parsed === null) throw fail('JSON did not match the task schema')
  return parsed
}

export async function askJson<T>(cfg: AiConfig, opts: AskOptions<T>): Promise<T> {
  return (await askJsonFrom(cfg, opts)).value
}

/** `askJson` with the model that answered. A malformed, cut or off-schema answer from the
 *  first router is asked once more of the fallback, which otherwise only a refusal reaches. */
export async function askJsonFrom<T>(cfg: AiConfig, opts: AskOptions<T>): Promise<{ value: T; model: string }> {
  const { res, from } = await send(cfg, opts, false)
  try {
    return { value: await readJson(res, from, opts.parse), model: from.model }
  } catch (e) {
    const other = from === cfg ? cfg.fallback : undefined
    if (!other || opts.signal?.aborted) throw e
    try {
      return { value: await readJson(await sendTo(other, opts, false), other, opts.parse), model: other.model }
    } catch (second) {
      if (opts.signal?.aborted) throw second
      throw new AiUnavailableError(`${message(e)}; fallback: ${message(second)}`, routerName(other))
    }
  }
}

/**
 * The reply as it is written. Resolves once the model has accepted the request, so a
 * refusal throws before the caller commits to a streamed response; the pieces that
 * follow throw AiUnavailableError on an `error` event or a stream cut before
 * `message_stop`.
 */
export async function streamText(cfg: AiConfig, opts: TextOptions): Promise<AsyncGenerator<string>> {
  const { res, from } = await send(cfg, opts, true)
  if (!res.body || !res.headers.get('content-type')?.includes('text/event-stream')) {
    // A router that ignores `stream` answers one body; its text is the whole reply.
    const { text } = await bodyText(res)
    return (async function* () { yield text })()
  }
  return deltas(res.body, routerName(from))
}

async function* deltas(body: ReadableStream<Uint8Array>, router: string): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffered = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) throw new AiUnavailableError('stream ended before message_stop', router)
      buffered += decoder.decode(value, { stream: true })
      const lines = buffered.split(/\r?\n/)
      buffered = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        let json: unknown
        try {
          json = JSON.parse(line.slice(5))
        } catch {
          continue
        }
        const event = streamEvent.safeParse(json)
        if (!event.success) continue
        if (event.data.type === 'error') throw new AiUnavailableError('error event in the stream', router)
        if (event.data.type === 'message_stop') return
        if (event.data.delta.type === 'text_delta' && event.data.delta.text) yield event.data.delta.text
      }
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
}
