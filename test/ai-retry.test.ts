import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { z } from 'zod'
import { askJson, askJsonFrom, AiUnavailableError } from '@/lib/ai/client'
import type { AiConfig } from '@/lib/ai/config'

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser } }) }))

import { POST, resetAiBudgets } from '@/app/api/ai/route'

const both: AiConfig = {
  baseUrl: 'http://nine.test/v1', apiKey: 'k1', model: 'm1',
  fallback: { baseUrl: 'http://omni.test/v1', apiKey: 'k2', model: 'zhesen' },
}
const schema = z.object({ answer: z.string() })
const parse = (v: unknown) => { const r = schema.safeParse(v); return r.success ? r.data : null }
const ask = (c: AiConfig) => askJson(c, { system: 's', user: 'u', parse, maxTokens: 10 })

const openai = (content: string, finish = 'stop') =>
  Response.json({ choices: [{ message: { content }, finish_reason: finish }] })

describe('a bad answer is asked once more of the other router', () => {
  const realFetch = globalThis.fetch
  afterEach(() => { globalThis.fetch = realFetch })

  it('answers from OmniRoute when 9router answers off the schema', async () => {
    const f = vi.fn(async (url: string) => (url.startsWith('http://nine.test')
      ? openai('{"nonsense":true}')
      : openai('{"answer":"dự phòng"}')))
    globalThis.fetch = f as unknown as typeof fetch
    await expect(askJsonFrom(both, { system: 's', user: 'u', parse, maxTokens: 10 }))
      .resolves.toEqual({ value: { answer: 'dự phòng' }, model: 'zhesen' })
    expect(f).toHaveBeenCalledTimes(2)
  })

  // A JSON object cut by the token limit can still close and parse, minus its tail.
  it('treats an answer cut at max_tokens as a failure, in both shapes', async () => {
    globalThis.fetch = vi.fn(async (url: string) => (url.startsWith('http://nine.test')
      ? openai('{"answer":"cụt"}', 'length')
      : Response.json({ content: [{ type: 'text', text: '{"answer":"cụt"}' }], stop_reason: 'max_tokens' }))) as unknown as typeof fetch
    await expect(ask(both)).rejects.toThrow(/max_tokens.*fallback: .*max_tokens/)
  })

  it('asks no third time when both answers are malformed', async () => {
    const f = vi.fn(async () => openai('không phải JSON'))
    globalThis.fetch = f as unknown as typeof fetch
    await expect(ask(both)).rejects.toThrow(AiUnavailableError)
    expect(f).toHaveBeenCalledTimes(2)
  })

  // The fallback already answered after 9router refused; asking 9router again is the same refusal.
  it('does not go back to 9router after it refused', async () => {
    const f = vi.fn(async (url: string) => (url.startsWith('http://nine.test')
      ? new Response('quota', { status: 429 })
      : openai('{"nonsense":true}')))
    globalThis.fetch = f as unknown as typeof fetch
    await expect(ask(both)).rejects.toMatchObject({ router: 'omni.test' })
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('makes one call when there is no fallback', async () => {
    const f = vi.fn(async () => openai('{"nonsense":true}'))
    globalThis.fetch = f as unknown as typeof fetch
    await expect(ask({ baseUrl: 'http://nine.test/v1', apiKey: 'k1', model: 'm1' }))
      .rejects.toMatchObject({ router: 'nine.test' })
    expect(f).toHaveBeenCalledOnce()
  })
})

describe('the route logs every failed call', () => {
  const realFetch = globalThis.fetch
  const saved: Record<string, string | undefined> = {}
  const ENV = ['AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL', 'AI_FALLBACK_BASE_URL', 'AI_FALLBACK_API_KEY'] as const

  beforeEach(() => {
    resetAiBudgets()
    getUser.mockReset().mockResolvedValue({ data: { user: { id: 'u1', email: 'learner@example.com' } } })
    for (const k of ENV) saved[k] = process.env[k]
    for (const k of ENV) delete process.env[k]
    process.env.AI_BASE_URL = 'http://nine.test/v1'
    process.env.AI_API_KEY = 'sk-secret-must-not-leak'
  })
  afterEach(() => {
    for (const k of ENV) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
    globalThis.fetch = realFetch
    vi.restoreAllMocks()
  })

  it('names the task, the router, the status and the error, never the prompt or the key', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    globalThis.fetch = vi.fn(async () => new Response('provider out of credits', { status: 402 })) as unknown as typeof fetch
    const res = await POST(new Request('http://localhost/api/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'enrich', input: { lang: 'en', headword: 'serendipity' } }),
    }))
    expect(res.status).toBe(502)
    const lines = log.mock.calls.filter((c) => c[0] === 'ai failed')
    expect(lines).toHaveLength(1)
    const line = lines[0].join(' ')
    expect(line).toContain('"task":"enrich"')
    expect(line).toContain('"router":"nine.test"')
    expect(line).toContain('"status":502')
    expect(line).toContain('"error":"http_402"')
    expect(line).not.toContain('provider out of credits')
    expect(line).not.toContain('serendipity')
    expect(line).not.toContain('sk-secret-must-not-leak')
  })
})

// The 30 s deadline can fire while the body is still arriving; that is a timeout (504), not
// an unreadable answer (502), and no other router is asked after it.
describe('a deadline while the body arrives', () => {
  const realFetch = globalThis.fetch
  afterEach(() => { globalThis.fetch = realFetch })

  it('rejects with the deadline, not as a bad answer', async () => {
    const f = vi.fn(async (_url: string, init?: RequestInit) => new Response(new ReadableStream({
      start(controller) {
        init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason))
      },
    })))
    globalThis.fetch = f as unknown as typeof fetch
    const stop = new AbortController()
    const pending = askJson(both, { system: 's', user: 'u', parse, maxTokens: 10, signal: stop.signal })
    await vi.waitFor(() => expect(f).toHaveBeenCalledTimes(1))
    stop.abort(new DOMException('deadline', 'TimeoutError'))
    await expect(pending).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(f).toHaveBeenCalledTimes(1)
  })
})
