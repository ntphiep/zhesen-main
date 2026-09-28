import { z } from '@/lib/zod'
import type { AiConfig } from './config'

/**
 * Requests to the model: `askJson` answers validated JSON, `streamText` plain text in
 * pieces. Both response shapes must stay handled: `POST /messages` with `stream: false`
 * answers an OpenAI `chat.completion` body while the same path answers Anthropic-shaped
 * events when streaming (measured against the router on 2026-09-14). `extractJson` also
 * unwraps a ```json fence.
 */

const openAiShape = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
})
const anthropicShape = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })).min(1),
})

/** The server-sent events that matter; only `message_stop` after a `stop_reason` other than
 *  `max_tokens` proves the text is whole. */
const streamEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('content_block_delta'), delta: z.object({ type: z.string(), text: z.string().optional() }) }),
  z.object({ type: z.literal('message_delta'), delta: z.object({ stop_reason: z.string().nullish() }) }),
  z.object({ type: z.literal('message_stop') }),
  z.object({ type: z.literal('error') }),
])

/** The model refused, timed out, or answered something that is not the shape asked for. */
export class AiUnavailableError extends Error {}

function messageText(body: unknown): string {
  const openai = openAiShape.safeParse(body)
  if (openai.success) return openai.data.choices[0].message.content
  const anthropic = anthropicShape.safeParse(body)
  if (anthropic.success) {
    const text = anthropic.data.content.find((c) => c.type === 'text')?.text
    if (text) return text
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

async function send(cfg: AiConfig, opts: TextOptions, stream: boolean): Promise<Response> {
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
    signal: opts.signal,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new AiUnavailableError(
      `model returned HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
    )
  }
  return res
}

async function bodyText(res: Response): Promise<string> {
  const body: unknown = await res.json().catch(() => null)
  return messageText(body)
}

export async function askJson<T>(cfg: AiConfig, opts: AskOptions<T>): Promise<T> {
  const text = extractJson(await bodyText(await send(cfg, opts, false)))
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new AiUnavailableError('malformed JSON in the response')
  }
  const parsed = opts.parse(value)
  if (parsed === null) throw new AiUnavailableError('JSON did not match the task schema')
  return parsed
}

/**
 * The reply as it is written. Resolves once the model has accepted the request, so a
 * refusal throws before the caller commits to a streamed response; the pieces that
 * follow throw AiUnavailableError on an `error` event, a reply cut by the token limit,
 * or a stream cut before `message_stop`.
 */
export async function streamText(cfg: AiConfig, opts: TextOptions): Promise<AsyncGenerator<string>> {
  const res = await send(cfg, opts, true)
  if (!res.body || !res.headers.get('content-type')?.includes('text/event-stream')) {
    // A router that ignores `stream` answers one body; its text is the whole reply.
    const text = await bodyText(res)
    return (async function* () { yield text })()
  }
  return deltas(res.body)
}

async function* deltas(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffered = ''
  let stopReason: string | null | undefined
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) throw new AiUnavailableError('stream ended before message_stop')
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
        if (event.data.type === 'error') throw new AiUnavailableError('error event in the stream')
        if (event.data.type === 'message_delta') { stopReason = event.data.delta.stop_reason; continue }
        if (event.data.type === 'message_stop') {
          if (stopReason === 'max_tokens') throw new AiUnavailableError('reply cut by max_tokens')
          return
        }
        if (event.data.delta.type === 'text_delta' && event.data.delta.text) yield event.data.delta.text
      }
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
}
