import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const ENV = ['AZURE_TRANSLATOR_KEY'] as const
const saved: Record<string, string | undefined> = {}

function post(body: unknown) {
  return POST(new Request('http://localhost/dictionary/translate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }))
}

function azureReplies(text: string, to: string) {
  return vi.fn(async () => new Response(
    JSON.stringify([{ translations: [{ text, to }] }]),
    { status: 200 },
  ))
}

import { POST } from '@/app/dictionary/translate/route'

describe('POST /dictionary/translate', () => {
  const realFetch = globalThis.fetch

  beforeEach(() => {
    for (const k of ENV) saved[k] = process.env[k]
    delete process.env.AZURE_TRANSLATOR_KEY
  })
  afterEach(() => {
    for (const k of ENV) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
    globalThis.fetch = realFetch
  })

  it('answers { enabled: false } with no key configured', async () => {
    const res = await post({ text: 'xin chào', to: ['en'] })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ enabled: false })
  })

  it('rejects a passage over 5000 characters and accepts one at the limit', async () => {
    expect((await post({ text: 'x'.repeat(5001), to: ['en'] })).status).toBe(400)
    expect((await post({ text: 'x'.repeat(5000), to: ['en'] })).status).toBe(200)
  })

  it('rejects a blank passage', async () => {
    expect((await post({ text: '   ', to: ['en'] })).status).toBe(400)
  })

  it('rejects a body with no target language', async () => {
    expect((await post({ text: 'hola', to: [] })).status).toBe(400)
  })

  it('rejects a body that is not the promised shape', async () => {
    expect((await post('null')).status).toBe(400)
    expect((await post('{oops')).status).toBe(400)
    expect((await post({ text: 'hola', to: ['fr'] })).status).toBe(400)
  })

  // Cases below need a configured key, so Azure itself is reached.
  describe('with Azure configured', () => {
    beforeEach(() => { process.env.AZURE_TRANSLATOR_KEY = 'test-key' })

    it('answers with the translation on a fresh passage', async () => {
      globalThis.fetch = azureReplies('hello', 'en')
      const res = await post({ text: 'xin chào cache test một', from: 'vi', to: ['en'] })
      expect(res.status).toBe(200)
      await expect(res.json()).resolves.toEqual({ enabled: true, from: 'vi', translations: { en: 'hello' } })
    })

    // The in-process cache is keyed on from:to:text, so a second identical request must
    // be served from memory rather than spending Azure quota twice.
    it('serves a second identical request from the in-process cache, without calling fetch again', async () => {
      const f = azureReplies('hello again', 'en')
      globalThis.fetch = f
      const body = { text: 'xin chào cache test hai', from: 'vi', to: ['en'] } as const

      const first = await post(body)
      expect(first.status).toBe(200)
      expect(f).toHaveBeenCalledTimes(1)

      const second = await post(body)
      expect(second.status).toBe(200)
      expect(f).toHaveBeenCalledTimes(1)
      await expect(second.json()).resolves.toEqual({
        enabled: true, from: 'vi', translations: { en: 'hello again' },
      })
    })
  })
})
