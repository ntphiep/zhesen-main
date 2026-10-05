import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { DictEntryDetail } from '@/lib/dictionary/types'
import type { LearnerLayer } from '@/lib/dictionary/learner'
import { queryBuilder } from './helpers/supabase'

const m = vi.hoisted(() => ({
  getUser: vi.fn(), rpc: vi.fn(), from: vi.fn(),
  detail: vi.fn(), layer: vi.fn(), inflections: vi.fn(), characters: vi.fn(), previews: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: m.getUser }, rpc: m.rpc, from: m.from }) }))
vi.mock('@/lib/dictionary/cached', () => ({
  getCachedEntryDetail: m.detail, getCachedInflections: m.inflections, getCachedCharacters: m.characters,
  getCachedTermPreviews: m.previews,
}))
vi.mock('@/lib/dictionary/learnerCached', () => ({ getCachedLearnerLayer: m.layer }))

import { checkGroundedCoach, groundedCoachPrompt, COACH_PROMPT_VERSION, type CoachGround } from '@/lib/ai/tasks'
import { coachGround, coachKey } from '@/lib/ai/coach'
import { resetAiCacheSecret } from '@/lib/ai/cacheSecret'
import { POST, resetAiBudgets } from '@/app/api/ai/route'

const ground = (over: Partial<CoachGround> = {}): CoachGround => ({
  lang: 'en', headword: 'take', gist: ['lấy', 'cầm'], senses: [{ pos: 'verb', vi: 'lấy', en: 'to get hold of' }],
  confusables: [{ id: 'k1', text: 'bring', note: 'mang tới chỗ người nói' }, { id: 'k2', text: 'carry', note: null }],
  collocations: [{ id: 'c1', text: 'take a break', vi: 'nghỉ giải lao' }],
  examples: [{ id: 'e1', text: 'Take a seat.', vi: 'Mời ngồi.' }],
  hanViet: [], forms: ['took', 'taken'], ...over,
})

const zh = (): CoachGround => ground({
  lang: 'zh', headword: '学习', gist: ['học'], confusables: [], collocations: [], examples: [],
  hanViet: [{ char: '学', readings: ['học'] }, { char: '习', readings: ['tập'] }], forms: [],
})

describe('the grounded coach prompt', () => {
  it('carries the entry data with its ids, and asks only for what the data lacks', () => {
    const p = groundedCoachPrompt(ground())
    expect(p).toContain('"id":"k2","text":"carry"')
    expect(p).toContain('take a break')
    expect(p).toContain('Mời ngồi.')
    expect(p).toContain('k2')
    expect(p).not.toContain('"collocations": mảng tối đa')
    expect(p).not.toContain('"examples": mảng 2')
  })

  it('starts a Chinese mnemonic from the Hán-Việt syllables', () => {
    const p = groundedCoachPrompt(zh())
    expect(p).toContain('học, tập')
    expect(p).toContain('"collocations": mảng tối đa')
  })
})

describe('checking a grounded answer', () => {
  const answer = (over: Record<string, unknown> = {}) => ({ mnemonic: 'take: tay cầm lấy', notes: [], ...over })

  it('refuses a note on a word that was not sent', () => {
    expect(checkGroundedCoach(answer({ notes: [{ linkId: 'k9', note: 'x' }] }), ground())).toBeNull()
  })

  it('keeps a note on an unnoted confusable, by its text, and drops one the layer already has', () => {
    const out = checkGroundedCoach(answer({ notes: [{ linkId: 'k2', note: 'carry là mang đi' }, { linkId: 'k1', note: 'lặp lại' }] }), ground())
    expect(out?.confusables).toEqual([{ word: 'carry', note: 'carry là mang đi' }])
  })

  // The page already shows the layer's collocations and examples; a second list contradicted them.
  it('leaves empty the lists the data already has', () => {
    const out = checkGroundedCoach(answer({
      collocations: ['take care'], examples: [{ text: 'Take it.', vi: 'Cầm lấy.' }],
    }), ground())
    expect(out).toMatchObject({ collocations: [], examples: [] })
  })

  it('keeps generated examples only when they use the word or a listed form', () => {
    const out = checkGroundedCoach(answer({
      examples: [{ text: 'She took it.', vi: 'Cô ấy lấy nó.' }, { text: 'Hello.', vi: 'Chào.' }],
    }), ground({ examples: [] }))
    expect(out?.examples).toEqual([{ text: 'She took it.', vi: 'Cô ấy lấy nó.' }])
  })

  it('refuses a Chinese mnemonic that quotes none of the Hán-Việt syllables', () => {
    expect(checkGroundedCoach(answer({ mnemonic: 'Hãy nhớ hình ảnh cái bàn.' }), zh())).toBeNull()
    expect(checkGroundedCoach(answer({ mnemonic: 'học tập: học rồi tập lại' }), zh())).toMatchObject({ mnemonic: 'học tập: học rồi tập lại' })
    // "học" inside "hoc" or another word does not count.
    expect(checkGroundedCoach(answer({ mnemonic: 'nhọc nhằn' }), zh())).toBeNull()
  })
})

const takeDetail: DictEntryDetail = {
  id: 'en:take', lang: 'en', headword: 'take', traditional: null, level: 'A1', ipa: null, pos: 'verb',
  glossVi: 'lấy', glossEn: 'to take', audioUrl: null,
  senses: [{ id: 's1', pos: 'verb', glossVi: 'lấy', glossEn: 'to get hold of', senseOrder: 1 }],
  pronunciations: [],
  examples: [
    { text: 'Take a seat.', reading: null, translationVi: 'Mời ngồi.', translationEn: null, senseId: 's1' },
    { text: 'Unlinked.', reading: null, translationVi: 'Không gắn nghĩa.', translationEn: null, senseId: null },
  ],
  relations: [{ relationType: 'collocation', relatedText: 'take part', relatedEntryId: null }],
  attributes: {},
}

const layer: LearnerLayer = {
  entryId: 'en:take', source: 'ai', gistVi: ['lấy'], level: 'A1', usageNoteVi: null, status: 'published', labels: [],
  confusables: [{ kind: 'confusable', text: 'bring', lang: 'en', targetEntryId: null, pattern: null, vi: null, noteVi: 'mang tới', example: null, exampleVi: null, reading: null, exampleReading: null }],
  senses: [{
    order: 1, pos: 'verb', viTerms: ['lấy', 'cầm'], viDefinition: 'cầm lấy', pivot: false, enDefinition: 'to get hold of',
    domain: null, register: null, cefr: 'A1', sourceSenseIds: ['s1'],
    examples: [{ text: 'Take my hand.', reading: null, vi: 'Nắm tay tôi.', sourceExampleId: 1, byModel: false, sourceId: null }],
    collocations: [{ kind: 'collocation', text: 'take a break', lang: 'en', targetEntryId: null, pattern: null, vi: 'nghỉ', noteVi: null, example: null, exampleVi: null, reading: null, exampleReading: null }],
    synonyms: [], antonyms: [], equivalents: [],
  }],
}

describe('the coach ground', () => {
  beforeEach(() => {
    m.detail.mockReset().mockResolvedValue(takeDetail)
    m.layer.mockReset().mockResolvedValue(null)
    m.inflections.mockReset().mockResolvedValue([{ formText: 'took', formLabel: null }])
    m.characters.mockReset().mockResolvedValue([])
  })

  it('reads the reviewed layer when the entry has one', async () => {
    m.layer.mockResolvedValue(layer)
    await expect(coachGround('en:take')).resolves.toMatchObject({
      gist: ['lấy'],
      senses: [{ pos: 'verb', vi: 'lấy, cầm', en: 'to get hold of' }],
      confusables: [{ id: 'k1', text: 'bring', note: 'mang tới' }],
      collocations: [{ id: 'c1', text: 'take a break', vi: 'nghỉ' }],
      examples: [{ id: 'e1', text: 'Take my hand.', vi: 'Nắm tay tôi.' }],
      forms: ['took'],
    })
  })

  it('falls back to the dictionary senses, with sense-linked translated examples only', async () => {
    await expect(coachGround('en:take')).resolves.toMatchObject({
      gist: ['lấy'], confusables: [],
      collocations: [{ id: 'c1', text: 'take part', vi: null }],
      examples: [{ id: 'e1', text: 'Take a seat.', vi: 'Mời ngồi.' }],
    })
  })

  it('carries the Hán-Việt reading of each Chinese character', async () => {
    m.detail.mockResolvedValue({ ...takeDetail, id: 'zh:学习', lang: 'zh', headword: '学习' })
    m.characters.mockResolvedValue([
      { char: '学', radical: null, strokeCount: null, hanViet: ['học'], pinyin: [], gloss: null },
      { char: '习', radical: null, strokeCount: null, hanViet: [], pinyin: [], gloss: null },
    ])
    await expect(coachGround('zh:学习')).resolves.toMatchObject({ hanViet: [{ char: '学', readings: ['học'] }] })
  })

  it('is null for an entry that does not exist', async () => {
    m.detail.mockResolvedValue(null)
    await expect(coachGround('en:nope')).resolves.toBeNull()
  })
})

describe('the coach route with an entry', () => {
  const realFetch = globalThis.fetch
  const saved: Record<string, string | undefined> = {}
  const ENV = ['AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL', 'AI_FALLBACK_BASE_URL', 'AI_FALLBACK_API_KEY', 'AI_CACHE_SECRET'] as const
  const stored = { mnemonic: 'đã lưu', collocations: [], examples: [], confusables: [] }

  const coach = (input: Record<string, unknown> = {}) => POST(new Request('http://localhost/api/ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ task: 'coach', input: { lang: 'en', headword: 'take', meaningVi: 'tin từ trình duyệt', entryId: 'en:take', ...input } }),
  }))
  const model = (content: unknown) => Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] })

  beforeEach(() => {
    resetAiBudgets()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    m.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'u1', email: 'learner@example.com' } } })
    m.rpc.mockReset().mockResolvedValue({ data: true, error: null })
    m.from.mockReset().mockReturnValue(queryBuilder({ data: null, error: null }))
    m.detail.mockReset().mockResolvedValue(takeDetail)
    m.layer.mockReset().mockResolvedValue(layer)
    m.inflections.mockReset().mockResolvedValue([])
    m.characters.mockReset().mockResolvedValue([])
    for (const k of ENV) saved[k] = process.env[k]
    for (const k of ENV) delete process.env[k]
    process.env.AI_BASE_URL = 'http://nine.test/v1'
    process.env.AI_API_KEY = 'k1'
    process.env.AI_MODEL = 'm1'
    process.env.AI_CACHE_SECRET = 'cache-secret'
    resetAiCacheSecret()
  })
  afterEach(() => {
    for (const k of ENV) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
    globalThis.fetch = realFetch
    vi.restoreAllMocks()
  })

  // The daily cap runs before the entry is read (review of 2026-10-05), so a stored answer
  // takes a call but never the model.
  it('answers from the stored answer without asking the model', async () => {
    m.from.mockReturnValue(queryBuilder({ data: { answer: stored }, error: null }))
    const f = vi.fn()
    globalThis.fetch = f
    const res = await coach()
    await expect(res.json()).resolves.toEqual({ data: stored })
    expect(f).not.toHaveBeenCalled()
    expect(m.rpc).toHaveBeenCalledWith('ai_take_call')
    expect(m.rpc).not.toHaveBeenCalledWith('ai_coach_store', expect.anything())
    expect(m.from).toHaveBeenCalledWith('ai_coach')
  })

  it('asks from the entry data, not from what the browser sent, and stores the checked answer', async () => {
    const f = vi.fn(async () => model({ mnemonic: 'take: tay cầm lấy', notes: [] }))
    globalThis.fetch = f as unknown as typeof fetch
    const res = await coach()
    await expect(res.json()).resolves.toEqual({ data: { mnemonic: 'take: tay cầm lấy', collocations: [], examples: [], confusables: [] } })
    const prompt = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).messages[0].content as string
    expect(prompt).toContain('take a break')
    expect(prompt).not.toContain('tin từ trình duyệt')
    expect(m.rpc).toHaveBeenCalledWith('ai_coach_store', {
      p_secret: 'cache-secret', p_cache_key: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_entry_id: 'en:take', p_prompt_version: COACH_PROMPT_VERSION, p_model: 'm1',
      p_answer: { mnemonic: 'take: tay cầm lấy', collocations: [], examples: [], confusables: [] },
    })
  })

  it('answers but stores nothing without the cache secret', async () => {
    delete process.env.AI_CACHE_SECRET
    resetAiCacheSecret()
    globalThis.fetch = vi.fn(async () => model({ mnemonic: 'take: tay cầm lấy', notes: [] })) as unknown as typeof fetch
    expect((await coach()).status).toBe(200)
    expect(m.rpc).not.toHaveBeenCalledWith('ai_coach_store', expect.anything())
  })

  it('stops a capped account before reading the entry or the cache', async () => {
    m.rpc.mockResolvedValue({ data: false, error: null })
    expect((await coach()).status).toBe(429)
    expect(m.detail).not.toHaveBeenCalled()
    expect(m.from).not.toHaveBeenCalled()
  })

  it('asks the other router when the answer points at a word that was not sent, and stores nothing on failure', async () => {
    process.env.AI_FALLBACK_BASE_URL = 'http://omni.test/v1'
    process.env.AI_FALLBACK_API_KEY = 'k2'
    const f = vi.fn(async () => model({ mnemonic: 'x', notes: [{ linkId: 'k7', note: 'bịa' }] }))
    globalThis.fetch = f as unknown as typeof fetch
    expect((await coach()).status).toBe(502)
    expect(f).toHaveBeenCalledTimes(2)
    expect(m.rpc).not.toHaveBeenCalledWith('ai_coach_store', expect.anything())
  })

  it('coaches from the saved headword when the entry does not exist', async () => {
    m.detail.mockResolvedValue(null)
    const f = vi.fn(async () => model({ mnemonic: 'm', collocations: [], examples: [], confusables: [] }))
    globalThis.fetch = f as unknown as typeof fetch
    expect((await coach({ entryId: 'en:nope' })).status).toBe(200)
    const prompt = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).messages[0].content as string
    expect(prompt).toContain('tin từ trình duyệt')
    expect(m.rpc).not.toHaveBeenCalledWith('ai_coach_store', expect.anything())
  })
})

describe('the coach cache key', () => {
  it('changes with anything the prompt is built from', () => {
    const g = ground()
    expect(coachKey('en:take', g)).toBe(coachKey('en:take', ground()))
    expect(coachKey('en:take', ground({ gist: ['lấy', 'mang'] }))).not.toBe(coachKey('en:take', g))
    expect(coachKey('en:taken', g)).not.toBe(coachKey('en:take', g))
  })
})
