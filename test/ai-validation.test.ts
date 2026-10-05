import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { TermPreview } from '@/lib/dictionary/types'

const { getUser, previews, inflections } = vi.hoisted(() => ({ getUser: vi.fn(), previews: vi.fn(), inflections: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser } }) }))
vi.mock('@/lib/dictionary/cached', () => ({ getCachedTermPreviews: previews, getCachedInflections: inflections }))

import { ERASED_TASKS } from '@/lib/ai/tasks'
import { resolveSuggestions } from '@/lib/ai/jobs'
import { POST, resetAiBudgets } from '@/app/api/ai/route'

const preview = (over: Partial<TermPreview>): TermPreview => ({
  matchText: 'x', id: 'en:x', headword: 'x', pos: null, ipa: null, reading: null, gender: null, glossVi: null, glossEn: null, ...over,
})

const enrichAnswer = (over: Record<string, unknown>) => ({
  meaningVi: 'con chó', ipa: 'dɔɡ', pos: 'noun', level: 'A1', example: 'The dog barked.', exampleVi: 'Con chó sủa.', ...over,
})

describe('enrich', () => {
  const parse = (input: unknown, answer: unknown, forms?: string[]) => ERASED_TASKS.enrich.parserFor(input, forms)(answer)

  // The prompt asks for one of six values; "B1+" or "intermediate" is no level, not a failure.
  it('keeps a CEFR level and reads anything else as none', () => {
    expect(parse({ lang: 'en', headword: 'dog' }, enrichAnswer({}))).toMatchObject({ level: 'A1' })
    expect(parse({ lang: 'en', headword: 'dog' }, enrichAnswer({ level: 'B1+' }))).toMatchObject({ level: null })
    expect(parse({ lang: 'en', headword: 'dog' }, enrichAnswer({ level: undefined }))).toMatchObject({ level: null })
  })

  it('drops a CEFR guess for Chinese, which is levelled by HSK', () => {
    expect(parse({ lang: 'zh', headword: '狗' }, enrichAnswer({ example: '狗在叫。' }))).toMatchObject({ level: null, example: '狗在叫。' })
  })

  it('drops an example that does not use the word, with its translation', () => {
    expect(parse({ lang: 'en', headword: 'dog' }, enrichAnswer({ example: 'The cat slept.', exampleVi: 'Con mèo ngủ.' })))
      .toMatchObject({ example: '', exampleVi: '' })
  })

  it('keeps an example that uses one of the entry forms', () => {
    expect(parse({ lang: 'en', headword: 'dog' }, enrichAnswer({ example: 'Two dogs barked.' }), ['dogs']))
      .toMatchObject({ example: 'Two dogs barked.', exampleVi: 'Con chó sủa.' })
    expect(parse({ lang: 'en', headword: 'take' }, enrichAnswer({ example: 'She took it.' }), ['took']))
      .toMatchObject({ example: 'She took it.' })
  })
})

describe('coach without an entry', () => {
  it('keeps only the examples that use the word', () => {
    const out = ERASED_TASKS.coach.parserFor({ lang: 'es', headword: 'comer', meaningVi: null }, ['comemos'])({
      mnemonic: '', collocations: [], confusables: [],
      examples: [{ text: 'Vamos a comer.', vi: 'Đi ăn thôi.' }, { text: 'Comemos pan.', vi: 'Ta ăn bánh mì.' }, { text: 'Hola.', vi: 'Chào.' }],
    })
    expect(out).toMatchObject({ examples: [{ text: 'Vamos a comer.', vi: 'Đi ăn thôi.' }, { text: 'Comemos pan.', vi: 'Ta ăn bánh mì.' }] })
  })
})

describe('suggestions', () => {
  beforeEach(() => { previews.mockReset() })

  // A suggested word linked to a search for the model's spelling, which could be empty.
  it('keeps only words the dictionary has, with its gloss and entry', async () => {
    previews.mockResolvedValue([preview({ matchText: 'postpone', id: 'en:postpone', headword: 'postpone', glossVi: 'hoãn lại' })])
    await expect(resolveSuggestions({ words: [
      { lang: 'en', headword: 'Postpone', meaningVi: 'dời' },
      { lang: 'en', headword: 'adjournify', meaningVi: 'hoãn' },
    ] })).resolves.toEqual({ words: [{ lang: 'en', headword: 'postpone', meaningVi: 'hoãn lại', entryId: 'en:postpone' }] })
    expect(previews).toHaveBeenCalledWith('en', ['Postpone', 'adjournify'])
  })

  it('lists an entry once when two candidates resolve to it', async () => {
    previews.mockResolvedValue([
      preview({ matchText: 'delay', id: 'en:delay', headword: 'delay', glossVi: 'trì hoãn' }),
      preview({ matchText: 'delays', id: 'en:delay', headword: 'delay', glossVi: 'trì hoãn' }),
    ])
    const out = await resolveSuggestions({ words: [
      { lang: 'en', headword: 'delay', meaningVi: 'a' }, { lang: 'en', headword: 'delays', meaningVi: 'b' },
    ] })
    expect(out.words).toHaveLength(1)
  })

  it('keeps the unchecked words when the lookup fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    previews.mockRejectedValue(new Error('timeout'))
    const words = [{ lang: 'en' as const, headword: 'postpone', meaningVi: 'dời' }]
    await expect(resolveSuggestions({ words })).resolves.toEqual({ words })
  })
})

describe('the route', () => {
  const realFetch = globalThis.fetch
  const saved: Record<string, string | undefined> = {}
  const ENV = ['AI_BASE_URL', 'AI_API_KEY', 'AI_FALLBACK_BASE_URL', 'AI_FALLBACK_API_KEY'] as const

  beforeEach(() => {
    resetAiBudgets()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    getUser.mockReset().mockResolvedValue({ data: { user: { id: 'u1', email: 'learner@example.com' } } })
    for (const k of ENV) saved[k] = process.env[k]
    for (const k of ENV) delete process.env[k]
    process.env.AI_BASE_URL = 'http://router.test/v1'
    process.env.AI_API_KEY = 'sk-test'
  })
  afterEach(() => {
    for (const k of ENV) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
    globalThis.fetch = realFetch
    vi.restoreAllMocks()
  })

  // took is a listed form of take, not a regular ending, so the forms come from the entry.
  it('reads the entry forms before judging an enrich example', async () => {
    previews.mockResolvedValue([preview({ matchText: 'take', id: 'en:take', headword: 'take' })])
    inflections.mockResolvedValue([{ formText: 'took', formLabel: 'past' }])
    globalThis.fetch = vi.fn(async () => Response.json({ choices: [{ message: { content: JSON.stringify(
      enrichAnswer({ meaningVi: 'lấy', example: 'She took the bus.', exampleVi: 'Cô ấy đi xe buýt.' }),
    ) } }] })) as unknown as typeof fetch
    const res = await POST(new Request('http://localhost/api/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'enrich', input: { lang: 'en', headword: 'take' } }),
    }))
    await expect(res.json()).resolves.toMatchObject({ data: { example: 'She took the bus.' } })
    expect(inflections).toHaveBeenCalledWith('en:take')
  })

  it('answers suggest with dictionary entries only', async () => {
    previews.mockResolvedValue([preview({ matchText: '饭', id: 'zh:饭', headword: '饭', glossVi: 'cơm' })])
    globalThis.fetch = vi.fn(async () => Response.json({ choices: [{ message: { content: JSON.stringify({ words: [
      { lang: 'zh', headword: '饭', meaningVi: 'bữa cơm' }, { lang: 'en', headword: 'rice', meaningVi: 'gạo' },
    ] }) } }] })) as unknown as typeof fetch
    const res = await POST(new Request('http://localhost/api/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'suggest', input: { query: 'cơm', direction: 'vi', targets: ['zh'] } }),
    }))
    await expect(res.json()).resolves.toEqual({ data: { words: [{ lang: 'zh', headword: '饭', meaningVi: 'cơm', entryId: 'zh:饭' }] } })
  })
})
