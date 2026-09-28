import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The assistant is for a permanent account only (test/ai-gate.test.ts); every case
// here runs as one.
const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser } }) }))

import { GET, POST, resetAiBudgets } from '@/app/api/ai/route'
import { anthropicStream, ndjsonLines } from './helpers/stream'

const ENV = ['AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL', 'TRUST_PROXY_HEADER', 'VERCEL'] as const
const saved: Record<string, string | undefined> = {}

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(new Request('http://localhost/api/ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }))
}

function modelReplies(content: string) {
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }))
}

describe('/api/ai', () => {
  const realFetch = globalThis.fetch

  beforeEach(() => {
    resetAiBudgets()
    getUser.mockReset().mockResolvedValue({ data: { user: { id: 'u1', email: 'learner@example.com' } } })
    for (const k of ENV) saved[k] = process.env[k]
    process.env.AI_BASE_URL = 'http://router.test/v1'
    process.env.AI_API_KEY = 'sk-secret-must-not-leak'
    process.env.AI_MODEL = 'test-model'
    // Both decide whether `clientKey` may believe x-forwarded-for, so a case
    // that means to test one path must not inherit the other from the machine
    // it happens to run on.
    delete process.env.TRUST_PROXY_HEADER
    delete process.env.VERCEL
  })
  afterEach(() => {
    for (const k of ENV) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
    globalThis.fetch = realFetch
  })

  // The router this points at lives on a private network, so a deployment that
  // cannot reach it is a supported state: the browser asks first and leaves the
  // buttons out rather than offering something that only fails.
  it('reports itself off when no model is configured', async () => {
    delete process.env.AI_BASE_URL
    await expect((await GET()).json()).resolves.toEqual({ enabled: false })
  })

  it('reports itself on when a model is configured', async () => {
    await expect((await GET()).json()).resolves.toEqual({ enabled: true })
  })

  it('refuses to work when no model is configured', async () => {
    delete process.env.AI_API_KEY
    expect((await post({ task: 'enrich', input: { lang: 'en', headword: 'dog' } })).status).toBe(503)
  })

  it('rejects an unknown task without calling the model', async () => {
    const f = vi.fn()
    globalThis.fetch = f
    expect((await post({ task: 'drop-tables', input: {} })).status).toBe(400)
    expect(f).not.toHaveBeenCalled()
  })

  it('rejects a body that is not JSON', async () => {
    expect((await post('not json')).status).toBe(400)
  })

  it('rejects an input the task schema does not accept', async () => {
    const f = vi.fn()
    globalThis.fetch = f
    expect((await post({ task: 'enrich', input: { lang: 'fr', headword: 'chien' } })).status).toBe(400)
    expect((await post({ task: 'enrich', input: { lang: 'en', headword: '' } })).status).toBe(400)
    expect(f).not.toHaveBeenCalled()
  })

  it('answers with the model output for a valid request', async () => {
    modelReplies(JSON.stringify({
      meaningVi: 'con chó', ipa: 'dɔɡ', pos: 'noun', level: 'A1',
      example: 'The dog barked.', exampleVi: 'Con chó sủa.',
    }))
    const res = await post({ task: 'enrich', input: { lang: 'en', headword: 'dog' } })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ data: { meaningVi: 'con chó', level: 'A1' } })
  })

  // Dừng before the first byte arrives must stop the model call, not only the page's read.
  it('stops the model call when the browser abandons the request', async () => {
    let modelSignal: AbortSignal | undefined
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      modelSignal = init?.signal ?? undefined
      return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 })
    })
    const browser = new AbortController()
    await POST(new Request('http://localhost/api/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'enrich', input: { lang: 'en', headword: 'dog' } }),
      signal: browser.signal,
    }))
    browser.abort()
    expect(modelSignal?.aborted).toBe(true)
  })

  it('turns a model that answers nonsense into 502, not a crash', async () => {
    modelReplies('Tôi không chắc lắm.')
    expect((await post({ task: 'enrich', input: { lang: 'en', headword: 'dog' } })).status).toBe(502)
  })

  // The key is the whole reason this route exists; it must never travel outward.
  it('keeps the key server-side, sending it only to the configured router', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"mnemonic":"","collocations":[],"examples":[],"confusables":[]}' } }],
    }), { status: 200 }))
    globalThis.fetch = f
    const res = await post({ task: 'coach', input: { lang: 'en', headword: 'dog', meaningVi: null } })
    expect(res.status).toBe(200)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://router.test/v1/messages')
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-secret-must-not-leak')
    expect(JSON.stringify(await res.json())).not.toContain('sk-secret-must-not-leak')
  })

  // `JSON.parse('null')` succeeds, so the try/catch around request.json() does
  // not stop null reaching the field reads. Casting it and dereferencing .task
  // threw, and the handler answered 500 to an ordinary bad request.
  it('answers 400, not 500, to a null body', async () => {
    expect((await post('null')).status).toBe(400)
  })

  it('answers 400 to a body that is not an object', async () => {
    for (const body of ['42', '"hello"', '[]']) {
      expect((await post(body)).status).toBe(400)
    }
  })

  // `clientKey` names nobody where x-forwarded-for is not the platform's word,
  // so on a bare `next start` the per-address limit never runs -- measured at 25
  // of 25 POSTs admitted. The search route survives that because its cold-query
  // limiter does not need to know who is asking; this route spends money per
  // call and had no second line at all.
  it('caps total calls even when the caller cannot be identified', async () => {
    modelReplies(JSON.stringify({
      meaningVi: 'x', ipa: 'x', pos: 'noun', level: 'A1', example: 'x', exampleVi: 'x',
    }))
    const statuses: number[] = []
    for (let i = 0; i < 70; i++) {
      statuses.push((await post({ task: 'enrich', input: { lang: 'en', headword: 'dog' } })).status)
    }
    expect(statuses).toContain(429)
    expect(statuses.filter((s) => s === 200).length).toBeLessThanOrEqual(60)
  })

  // The per-address limit is what keeps one caller from spending everyone's
  // budget, and on Vercel it needs no flag: the platform overwrites
  // x-forwarded-for at its edge, so the address in it is the platform's word.
  // Before this, every visitor shared the one global bucket and a single script
  // could take all sixty calls a minute away from real users.
  it('caps one address without shutting out the next on a deployment', async () => {
    process.env.VERCEL = '1'
    modelReplies(JSON.stringify({
      meaningVi: 'x', ipa: 'x', pos: 'noun', level: 'A1', example: 'x', exampleVi: 'x',
    }))
    const flood = (ip: string) => post(
      { task: 'enrich', input: { lang: 'en', headword: 'dog' } },
      { 'x-forwarded-for': ip },
    )
    const first: number[] = []
    for (let i = 0; i < 25; i++) first.push((await flood('203.0.113.7')).status)
    expect(first.filter((s) => s === 200).length).toBe(20)
    expect(first).toContain(429)
    expect((await flood('203.0.113.8')).status).toBe(200)
  })

  // The global bucket is one bucket for everyone, so charging a request that
  // never reaches the model turned it into a lever: sixty pieces of junk a
  // minute cost the sender nothing and answered every real user with 429.
  it('does not spend the shared budget on requests that never reach the model', async () => {
    for (let i = 0; i < 70; i++) {
      expect((await post({ task: 'nope', input: {} })).status).toBe(400)
    }
    modelReplies(JSON.stringify({
      meaningVi: 'x', ipa: 'x', pos: 'noun', level: 'A1', example: 'x', exampleVi: 'x',
    }))
    const real = await post({ task: 'enrich', input: { lang: 'en', headword: 'dog' } })
    expect(real.status).toBe(200)
  })

  describe('chat, which streams', () => {
    const chat = { task: 'chat', input: { messages: [{ role: 'user', text: 'từ này nghĩa gì' }] } }

    // A two-sentence reply took 12,179 ms with nothing on screen, so the text goes out
    // as it arrives and the checked answer closes the stream.
    it('sends each piece of text as it arrives, then the checked answer', async () => {
      globalThis.fetch = vi.fn(async () => anthropicStream(['Hoãn ', 'lại.']))
      const res = await post(chat)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('application/x-ndjson')
      expect(res.headers.get('cache-control')).toBe('private, no-store')
      expect(await ndjsonLines(res)).toEqual([
        { text: 'Hoãn ' }, { text: 'lại.' }, { data: { reply: 'Hoãn lại.' } },
      ])
    })

    it('answers 502 before streaming when the model refuses', async () => {
      globalThis.fetch = vi.fn(async () => new Response('down', { status: 500 }))
      expect((await post(chat)).status).toBe(502)
    })

    it('ends with an error line, not an answer, when the model breaks off', async () => {
      globalThis.fetch = vi.fn(async () => anthropicStream(['Hoãn '], [
        { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } },
      ]))
      const lines = await ndjsonLines(await post(chat))
      expect(lines.at(-1)).toEqual({ error: 'Trợ lý chưa trả lời được. Thử lại sau.' })
      expect(lines.some((l) => typeof l === 'object' && l !== null && 'data' in l)).toBe(false)
    })

    // A reply past the schema's cap once streamed in full, then vanished into an error.
    it('stops the reply at the cap and keeps the text already sent as the answer', async () => {
      let modelSignal: AbortSignal | undefined
      globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        modelSignal = init?.signal ?? undefined
        return anthropicStream(['a'.repeat(1000), 'b'.repeat(1000), 'c'])
      })
      const lines = await ndjsonLines(await post(chat))
      const reply = `${'a'.repeat(1000)}${'b'.repeat(500)}`
      expect(lines).toEqual([{ text: 'a'.repeat(1000) }, { text: 'b'.repeat(500) }, { data: { reply } }])
      expect(modelSignal?.aborted).toBe(true)
    })

    it('still holds the reply to the task schema', async () => {
      globalThis.fetch = vi.fn(async () => anthropicStream(['   ']))
      expect((await ndjsonLines(await post(chat))).at(-1)).toEqual({ error: 'Trợ lý chưa trả lời được. Thử lại sau.' })
    })
  })
})
