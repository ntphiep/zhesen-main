import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { z } from 'zod'
import { askJson, extractJson, AiUnavailableError } from '@/lib/ai/client'
import type { AiConfig } from '@/lib/ai/config'

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
