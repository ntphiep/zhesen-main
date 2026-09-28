import { describe, it, expect, vi, afterEach } from 'vitest'
import { callAi } from '@/lib/ai/browser'
import { chunked } from './helpers/stream'

const input = { messages: [{ role: 'user' as const, text: 'từ này nghĩa gì' }] }

function streamed(lines: unknown[]): Response {
  return new Response(chunked(lines.map((l) => `${JSON.stringify(l)}\n`).join('')), {
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8' },
  })
}

describe('callAi on a streamed answer', () => {
  const realFetch = globalThis.fetch
  afterEach(() => { globalThis.fetch = realFetch })

  it('hands over the text so far on every piece, then the checked answer', async () => {
    globalThis.fetch = vi.fn(async () => streamed([
      { text: 'Hoãn ' }, { text: 'lại.' }, { data: { reply: 'Hoãn lại.' } },
    ]))
    const seen: string[] = []
    const outcome = await callAi('chat', input, undefined, (text) => seen.push(text))
    expect(seen).toEqual(['Hoãn ', 'Hoãn lại.'])
    expect(outcome).toEqual({ status: 'ok', data: { reply: 'Hoãn lại.' } })
  })

  it('reports the error line the route ends with', async () => {
    globalThis.fetch = vi.fn(async () => streamed([
      { text: 'Hoãn ' }, { error: 'Trợ lý trả lời quá lâu. Thử lại sau.' },
    ]))
    await expect(callAi('chat', input)).resolves.toEqual({
      status: 'error', message: 'Trợ lý trả lời quá lâu. Thử lại sau.',
    })
  })

  // A cut connection ends the body without an answer line; the text so far is not one.
  it('treats a stream that stops without an answer as a failure', async () => {
    globalThis.fetch = vi.fn(async () => streamed([{ text: 'Hoãn ' }]))
    expect((await callAi('chat', input)).status).toBe('error')
  })

  it('lets an abort through for the caller to ignore', async () => {
    const stop = new AbortController()
    globalThis.fetch = vi.fn(async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"text":"Hoãn "}\n'))
        stop.signal.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')))
      },
    }), { headers: { 'content-type': 'application/x-ndjson' } }))
    const pending = callAi('chat', input, stop.signal, () => stop.abort())
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
