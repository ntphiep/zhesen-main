import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { z } from 'zod'
import { askJson, extractJson, streamText, AiUnavailableError, FIRST_ROUTER_MS } from '@/lib/ai/client'
import type { AiConfig } from '@/lib/ai/config'
import { anthropicStream } from './helpers/stream'

const cfg: AiConfig = { baseUrl: 'http://router.test/v1', apiKey: 'k', model: 'm' }
const schema = z.object({ answer: z.string() })
const parse = (v: unknown) => { const r = schema.safeParse(v); return r.success ? r.data : null }

function reply(body: unknown, ok = true) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: ok ? 200 : 500 }))
}

describe('extractJson', () => {
  it('takes the object out of a ```json fence', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}')
  })
  it('takes the object out of a bare fence', () => {
    expect(extractJson('```\n{"a":1}\n```')).toBe('{"a":1}')
  })
  it('drops chatter around the object', () => {
    expect(extractJson('Chắc chắn rồi! {"a":1} Hy vọng giúp được bạn.')).toBe('{"a":1}')
  })
  it('rejects a reply with no object at all', () => {
    expect(() => extractJson('Xin lỗi, tôi không biết.')).toThrow(AiUnavailableError)
  })
})

describe('askJson', () => {
  const realFetch = globalThis.fetch
  beforeEach(() => { vi.restoreAllMocks() })
  afterEach(() => { globalThis.fetch = realFetch })

  // The router in front of the model answers `POST /messages` with an OpenAI
  // `chat.completion` body when not streaming, and an Anthropic body otherwise.
  // Both are real replies from the same endpoint, so both have to work.
  it('reads an OpenAI-shaped reply', async () => {
    globalThis.fetch = reply({ choices: [{ message: { content: '{"answer":"xin chào"}' } }] })
    await expect(askJson(cfg, { system: 's', user: 'u', parse, maxTokens: 10 }))
      .resolves.toEqual({ answer: 'xin chào' })
  })

  it('reads an Anthropic-shaped reply', async () => {
    globalThis.fetch = reply({ content: [{ type: 'text', text: '{"answer":"xin chào"}' }] })
    await expect(askJson(cfg, { system: 's', user: 'u', parse, maxTokens: 10 }))
      .resolves.toEqual({ answer: 'xin chào' })
  })

  it('reports a non-OK response rather than parsing the error body', async () => {
    globalThis.fetch = reply({ error: 'nope' }, false)
    await expect(askJson(cfg, { system: 's', user: 'u', parse, maxTokens: 10 }))
      .rejects.toThrow(AiUnavailableError)
  })

  it('rejects an answer that is the wrong shape', async () => {
    globalThis.fetch = reply({ choices: [{ message: { content: '{"nonsense":true}' } }] })
    await expect(askJson(cfg, { system: 's', user: 'u', parse, maxTokens: 10 }))
      .rejects.toThrow(AiUnavailableError)
  })

  it('rejects malformed JSON instead of throwing SyntaxError', async () => {
    globalThis.fetch = reply({ choices: [{ message: { content: '{"answer": }' } }] })
    await expect(askJson(cfg, { system: 's', user: 'u', parse, maxTokens: 10 }))
      .rejects.toThrow(AiUnavailableError)
  })

  it('rejects a body in neither shape', async () => {
    globalThis.fetch = reply({ surprise: true })
    await expect(askJson(cfg, { system: 's', user: 'u', parse, maxTokens: 10 }))
      .rejects.toThrow(AiUnavailableError)
  })

  it('never streams, so the reply is one JSON body', async () => {
    const f = reply({ choices: [{ message: { content: '{"answer":"a"}' } }] })
    globalThis.fetch = f
    await askJson(cfg, { system: 's', user: 'u', parse, maxTokens: 10 })
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body.stream).toBe(false)
    expect(body.model).toBe('m')
  })
})

describe('streamText', () => {
  const realFetch = globalThis.fetch
  const opts = { system: 's', user: 'u', maxTokens: 10 }
  afterEach(() => { globalThis.fetch = realFetch })

  async function collect(pieces: AsyncIterable<string>): Promise<string[]> {
    const out: string[] = []
    for await (const piece of pieces) out.push(piece)
    return out
  }

  it('asks the model to stream', async () => {
    const f = vi.fn(async () => anthropicStream(['a']))
    globalThis.fetch = f
    await collect(await streamText(cfg, opts))
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body.stream).toBe(true)
  })

  // Streaming answers Anthropic-shaped events on the same endpoint that answers an
  // OpenAI body without streaming. The pieces arrive cut mid-event and mid-character.
  it('yields the text of each delta event in order', async () => {
    globalThis.fetch = vi.fn(async () => anthropicStream(['Hoãn ', 'lại ', 'cuộc họp.']))
    expect(await collect(await streamText(cfg, opts))).toEqual(['Hoãn ', 'lại ', 'cuộc họp.'])
  })

  it('fails on an error event after some text has arrived', async () => {
    globalThis.fetch = vi.fn(async () => anthropicStream(['Hoãn '], [
      { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } },
    ]))
    await expect(collect(await streamText(cfg, opts))).rejects.toThrow(AiUnavailableError)
  })

  it('fails on a stream that stops without message_stop', async () => {
    globalThis.fetch = vi.fn(async () => anthropicStream(['Hoãn '], []))
    await expect(collect(await streamText(cfg, opts))).rejects.toThrow(AiUnavailableError)
  })

  // A reply cut by the token limit is kept like one cut at the character cap: the learner saw it.
  it('keeps the text of a reply cut by the token limit', async () => {
    globalThis.fetch = vi.fn(async () => anthropicStream(['Hoãn '], [
      { type: 'message_delta', delta: { stop_reason: 'max_tokens', stop_sequence: null }, usage: { output_tokens: 900 } },
      { type: 'message_stop' },
    ]))
    expect(await collect(await streamText(cfg, opts))).toEqual(['Hoãn '])
  })

  it('accepts a reply that ended on its own', async () => {
    globalThis.fetch = vi.fn(async () => anthropicStream(['Hoãn.'], [
      { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 3 } },
      { type: 'message_stop' },
    ]))
    expect(await collect(await streamText(cfg, opts))).toEqual(['Hoãn.'])
  })

  it('reports a non-OK response before yielding anything', async () => {
    globalThis.fetch = reply({ error: 'nope' }, false)
    await expect(streamText(cfg, opts)).rejects.toThrow(AiUnavailableError)
  })

  it('keeps the text of a one-body reply cut by the token limit', async () => {
    globalThis.fetch = reply({ choices: [{ message: { content: 'Hoãn' }, finish_reason: 'length' }] })
    expect(await collect(await streamText(cfg, opts))).toEqual(['Hoãn'])
  })

  it('takes the text whole from a router that answers one body', async () => {
    globalThis.fetch = reply({ choices: [{ message: { content: 'Hoãn lại.' } }] })
    expect(await collect(await streamText(cfg, opts))).toEqual(['Hoãn lại.'])
  })
})

describe('the fallback router', () => {
  const realFetch = globalThis.fetch
  afterEach(() => { globalThis.fetch = realFetch })
  const both: AiConfig = { ...cfg, fallback: { baseUrl: 'http://omni.test/v1', apiKey: 'k2', model: 'zhesen' } }
  const ask = (c: AiConfig, signal?: AbortSignal) => askJson(c, { system: 's', user: 'u', parse, maxTokens: 10, signal })

  it('answers from OmniRoute when 9router refuses', async () => {
    const f = vi.fn(async (url: string) => (url.startsWith('http://router.test')
      ? new Response('{"error":"quota"}', { status: 503 })
      : Response.json({ content: [{ type: 'text', text: '{"answer":"dự phòng"}' }] })))
    globalThis.fetch = f as unknown as typeof fetch
    await expect(ask(both)).resolves.toEqual({ answer: 'dự phòng' })
    const [url, init] = f.mock.calls[1] as unknown as [string, RequestInit]
    expect(url).toBe('http://omni.test/v1/messages')
    expect(JSON.parse(init.body as string).model).toBe('zhesen')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer k2')
  })

  it('answers from OmniRoute when 9router cannot be reached', async () => {
    globalThis.fetch = vi.fn(async (url: string) => {
      if (url.startsWith('http://router.test')) throw new TypeError('fetch failed')
      return Response.json({ content: [{ type: 'text', text: '{"answer":"b"}' }] })
    }) as unknown as typeof fetch
    await expect(ask(both)).resolves.toEqual({ answer: 'b' })
  })

  it('names both failures when both routers refuse', async () => {
    globalThis.fetch = vi.fn(async () => new Response('{"error":"quota"}', { status: 503 })) as unknown as typeof fetch
    await expect(ask(both)).rejects.toThrow(/HTTP 503.*fallback: .*HTTP 503/)
  })

  it('does not call OmniRoute once the caller gave up', async () => {
    const abort = new AbortController()
    const f = vi.fn(async () => { abort.abort(); throw new DOMException('aborted', 'AbortError') })
    globalThis.fetch = f as unknown as typeof fetch
    await expect(ask(both, abort.signal)).rejects.toThrow('aborted')
    expect(f).toHaveBeenCalledOnce()
  })

  it('never calls OmniRoute when 9router answers', async () => {
    const f = reply({ content: [{ type: 'text', text: '{"answer":"a"}' }] })
    globalThis.fetch = f
    await ask(both)
    expect(f).toHaveBeenCalledOnce()
  })

  it('streams from OmniRoute when 9router refuses the stream', async () => {
    globalThis.fetch = vi.fn(async (url: string) => (url.startsWith('http://router.test')
      ? new Response('{"error":"quota"}', { status: 429 })
      : anthropicStream(['Dự ', 'phòng.']))) as unknown as typeof fetch
    const pieces: string[] = []
    for await (const p of await streamText(both, { system: 's', user: 'u', maxTokens: 10 })) pieces.push(p)
    expect(pieces).toEqual(['Dự ', 'phòng.'])
  })

  describe('with a clock', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    // Hangs until its signal aborts, as a router whose provider never answers.
    const hang = (url: string, init: RequestInit) => new Promise<Response>((_, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal?.reason))
      void url
    })

    it('asks OmniRoute once 9router has been silent for FIRST_ROUTER_MS', async () => {
      const f = vi.fn(async (url: string, init: RequestInit) => (url.startsWith('http://router.test')
        ? hang(url, init)
        : Response.json({ content: [{ type: 'text', text: '{"answer":"muộn"}' }] })))
      globalThis.fetch = f as unknown as typeof fetch
      const answer = ask(both)
      await vi.advanceTimersByTimeAsync(FIRST_ROUTER_MS)
      await expect(answer).resolves.toEqual({ answer: 'muộn' })
      expect(f).toHaveBeenCalledTimes(2)
    })

    it("keeps the caller's timeout when OmniRoute outlives the deadline", async () => {
      const deadline = new AbortController()
      globalThis.fetch = vi.fn(async (url: string, init: RequestInit) => (url.startsWith('http://router.test')
        ? new Response('{"error":"quota"}', { status: 503 })
        : hang(url, init))) as unknown as typeof fetch
      const answer = ask(both, deadline.signal)
      const settled = expect(answer).rejects.toMatchObject({ name: 'TimeoutError' })
      await vi.advanceTimersByTimeAsync(1000)
      deadline.abort(new DOMException('deadline', 'TimeoutError'))
      await settled
    })
  })
})
