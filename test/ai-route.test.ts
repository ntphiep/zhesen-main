import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET, POST } from '@/app/api/ai/route'

const ENV = ['AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL'] as const
const saved: Record<string, string | undefined> = {}

function post(body: unknown) {
  return POST(new Request('http://localhost/api/ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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
    for (const k of ENV) saved[k] = process.env[k]
    process.env.AI_BASE_URL = 'http://router.test/v1'
    process.env.AI_API_KEY = 'sk-secret-must-not-leak'
    process.env.AI_MODEL = 'test-model'
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
})
