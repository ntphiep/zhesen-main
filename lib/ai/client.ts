import { z } from '@/lib/zod'
import type { AiConfig } from './config'

/**
 * One request to the model, answered as validated JSON. Both response shapes must stay
 * handled: `POST /messages` with `stream: false` answers an OpenAI `chat.completion` body
 * while the same path answers Anthropic-shaped events when streaming (measured against the
 * router on 2026-09-14). `extractJson` also unwraps a ```json fence.
 */

const openAiShape = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
})
const anthropicShape = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })).min(1),
})

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

export interface AskOptions<T> {
  system: string
  user: string
  /** Validates the model's JSON. Returns null when it is not the shape asked for.
   *  A function rather than a schema so the task registry can hand over an
   *  already-narrowed validator instead of a union of schemas. */
  parse: (value: unknown) => T | null
  maxTokens: number
  /** Aborts the request; the caller owns the deadline. */
  signal?: AbortSignal
}

export async function askJson<T>(cfg: AiConfig, opts: AskOptions<T>): Promise<T> {
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
      stream: false,
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

  const text = extractJson(messageText(await res.json()))
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
