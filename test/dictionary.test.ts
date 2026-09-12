import { describe, it, expect, vi } from 'vitest'
import {
  pickIpa, pickPrimarySense, searchEntries, searchEntriesVi, suggestNearby, searchBothDirections,
  getEntryDetail, getCrossLanguage, getCharacters, resolveTokens, getZhSegmentCandidates,
} from '@/lib/dictionary/search'

describe('pickIpa', () => {
  it('prefers en-US, then en-UK', () => {
    expect(pickIpa([{ accent: 'en-UK', ipa: '/uk/' }, { accent: 'en-US', ipa: '/us/' }], 'en')).toBe('/us/')
    expect(pickIpa([{ accent: 'en-UK', ipa: '/uk/' }], 'en')).toBe('/uk/')
    expect(pickIpa([{ accent: 'zh-pinyin', ipa: 'nǐ' }], 'zh')).toBe('nǐ')
    expect(pickIpa([], 'en')).toBeNull()
  })
})

describe('pickPrimarySense', () => {
  it('returns the lowest sense_order', () => {
    const s = pickPrimarySense([
      { pos: 'noun', glossVi: 'b', glossEn: null, senseOrder: 2 },
      { pos: 'verb', glossVi: 'a', glossEn: null, senseOrder: 1 },
    ])
    expect(s?.glossVi).toBe('a')
    expect(pickPrimarySense([])).toBeNull()
  })
})

// Mock supabase query builder
function mockClient(returnData: unknown) {
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  Object.assign(builder, {
    select: vi.fn(chain),
    eq: vi.fn(chain),
    ilike: vi.fn(chain),
    order: vi.fn(chain),
    limit: vi.fn(() => Promise.resolve({ data: returnData, error: null })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: returnData, error: null })),
  })
  return {
    schema: vi.fn(() => ({ from: vi.fn(() => builder) })),
  } as unknown as import('@supabase/supabase-js').SupabaseClient
}

// searchEntries is backed by the lex.search RPC (supabase/migrations/0016_search.sql),
// which already picks the primary sense/pronunciation in SQL, so the mocked row is flat.
function rpcClient(returnData: unknown) {
  const rpc = vi.fn(() => Promise.resolve({ data: returnData, error: null }))
  const client = { schema: vi.fn(() => ({ rpc })) } as unknown as import('@supabase/supabase-js').SupabaseClient
  return { client, rpc }
}

describe('searchEntries', () => {
  it('maps the lex.search RPC row to a preview', async () => {
    const { client } = rpcClient([
      {
        id: 'en:dog', lang: 'en', headword: 'dog', traditional: null, level: 'A1', frequency_rank: 500,
        attributes: {}, pos: 'noun', gloss_vi: 'con chó', gloss_en: 'dog', ipa: '/dɔːɡ/', audio_url: 'x.ogg', rank: 0.9,
      },
    ])
    const res = await searchEntries(client, 'en', 'dog')
    expect(res[0]).toMatchObject({ id: 'en:dog', headword: 'dog', ipa: '/dɔːɡ/', glossVi: 'con chó', pos: 'noun', audioUrl: 'x.ogg', level: 'A1' })
  })

  it('calls the RPC with the trimmed query, the single language, and the limit', async () => {
    const { client, rpc } = rpcClient([])
    await searchEntries(client, 'en', '  dog  ', 5)
    expect(rpc).toHaveBeenCalledWith('search', { p_q: 'dog', p_langs: ['en'], p_limit: 5 })
  })

  it('returns [] without calling the RPC for an empty query', async () => {
    const { client, rpc } = rpcClient([])
    expect(await searchEntries(client, 'en', '   ')).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })
})

// searchBothDirections drives multiple RPC names (search, search_vi, suggest) in
// one call, so the mock must dispatch by name rather than return one canned result.
function namedRpcClient(byName: Record<string, unknown>) {
  const rpc = vi.fn((name: string) => Promise.resolve({ data: byName[name] ?? [], error: null }))
  const client = { schema: vi.fn(() => ({ rpc })) } as unknown as import('@supabase/supabase-js').SupabaseClient
  return { client, rpc }
}

const receiveViRow = {
  id: 'en:receive', lang: 'en', headword: 'receive', traditional: null, level: null, frequency_rank: 3000,
  attributes: {}, pos: 'verb', gloss_vi: 'nhận được', gloss_en: 'receive', ipa: null, audio_url: null, rank: 4.2,
}

describe('searchEntriesVi', () => {
  it('maps the lex.search_vi RPC row to a preview', async () => {
    const { client } = rpcClient([receiveViRow])
    const res = await searchEntriesVi(client, 'en', 'nhận được')
    expect(res[0]).toMatchObject({ id: 'en:receive', headword: 'receive', glossVi: 'nhận được' })
  })

  it('calls the RPC with the trimmed query, the single language, and the limit', async () => {
    const { client, rpc } = rpcClient([])
    await searchEntriesVi(client, 'en', '  nhận được  ', 5)
    expect(rpc).toHaveBeenCalledWith('search_vi', { p_q: 'nhận được', p_langs: ['en'], p_limit: 5 })
  })

  it('returns [] without calling the RPC for an empty query', async () => {
    const { client, rpc } = rpcClient([])
    expect(await searchEntriesVi(client, 'en', '   ')).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('suggestNearby', () => {
  it('maps the lex.suggest RPC row to a suggestion', async () => {
    const { client } = rpcClient([{ id: 'en:receive', lang: 'en', headword: 'receive', gloss_vi: 'nhận được', kind: 'headword', score: 0.5 }])
    const res = await suggestNearby(client, 'recieve')
    expect(res).toEqual([{ id: 'en:receive', lang: 'en', headword: 'receive', glossVi: 'nhận được' }])
  })

  it('returns [] without calling the RPC for an empty query', async () => {
    const { client, rpc } = rpcClient([])
    expect(await suggestNearby(client, '  ')).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('searchBothDirections', () => {
  it('does not try the reverse direction for a plain forward match', async () => {
    const { client, rpc } = namedRpcClient({ search: [receiveViRow] })
    const res = await searchBothDirections(client, 'receive')
    expect(res.forward.en).toHaveLength(1)
    expect(res.reverse).toEqual({ en: [], zh: [], es: [] })
    expect(rpc).not.toHaveBeenCalledWith('search_vi', expect.anything())
  })

  it('tries the reverse direction whenever the query looks Vietnamese', async () => {
    const { client, rpc } = namedRpcClient({ search_vi: [receiveViRow] })
    const res = await searchBothDirections(client, 'nhận được')
    expect(res.reverse.en).toHaveLength(1)
    expect(rpc).toHaveBeenCalledWith('search_vi', expect.objectContaining({ p_q: 'nhận được' }))
  })

  it('falls back to the reverse direction when the forward search finds nothing (no diacritics typed)', async () => {
    const { client } = namedRpcClient({ search_vi: [receiveViRow] })
    const res = await searchBothDirections(client, 'nhan duoc')
    expect(res.reverse.en).toHaveLength(1)
  })

  it('suggests nearby matches only when both directions come back empty', async () => {
    const { client, rpc } = namedRpcClient({
      suggest: [{ id: 'en:receive', lang: 'en', headword: 'receive', gloss_vi: 'nhận được', kind: 'headword', score: 0.5 }],
    })
    const res = await searchBothDirections(client, 'zzzz')
    expect(res.suggestions).toEqual([{ id: 'en:receive', lang: 'en', headword: 'receive', glossVi: 'nhận được' }])
    expect(rpc).toHaveBeenCalledWith('suggest', expect.objectContaining({ p_q: 'zzzz' }))
  })

  it('returns empty without calling any RPC for an empty query', async () => {
    const { client, rpc } = namedRpcClient({})
    const res = await searchBothDirections(client, '   ')
    expect(res).toEqual({ forward: { en: [], zh: [], es: [] }, reverse: { en: [], zh: [], es: [] }, suggestions: [] })
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('getEntryDetail', () => {
  it('returns null when not found', async () => {
    const client = mockClient(null)
    expect(await getEntryDetail(client, 'en:nope')).toBeNull()
  })
})

// Returns queued results in call order; `.eq` and `.in` are terminal (awaited).
function queueClient(results: { data: unknown; error: null }[]) {
  let i = 0
  const next = () => Promise.resolve(results[i++] ?? { data: [], error: null })
  const builder: Record<string, unknown> = {}
  Object.assign(builder, {
    select: vi.fn(() => builder),
    eq: vi.fn(() => next()),
    in: vi.fn(() => next()),
  })
  return {
    schema: vi.fn(() => ({ from: vi.fn(() => builder) })),
  } as unknown as import('@supabase/supabase-js').SupabaseClient
}

// Cross-language mock: the source row is read via from(...).maybeSingle(); the
// match runs via schema(...).rpc(...). Both consume the result queue in call order.
// The matching/exclusion itself lives in the SQL function, so the rpc result is the
// already-filtered sibling list; the unit test covers pivot gating + row mapping.
function crossClient(results: { data: unknown; error: null }[]) {
  let i = 0
  const next = () => Promise.resolve(results[i++] ?? { data: [], error: null })
  const builder: Record<string, unknown> = {}
  Object.assign(builder, { select: () => builder, eq: () => builder, maybeSingle: () => next() })
  return { schema: () => ({ from: () => builder, rpc: () => next() }) } as unknown as import('@supabase/supabase-js').SupabaseClient
}

const sib = (id: string, lang: string, headword: string, gloss_vi: string | null, gloss_en: string | null) =>
  ({ id, lang, headword, gloss_vi, gloss_en })

describe('getCrossLanguage', () => {
  it('maps the matcher result for an English word, snake_case to camelCase', async () => {
    const client = crossClient([
      { data: { lang: 'en', headword_normalized: 'dog', senses: [{ gloss_en: 'dog' }] }, error: null }, // source
      { data: [sib('es:perro', 'es', 'perro', 'con chó', 'dog'), sib('zh:狗', 'zh', '狗', null, 'dog')], error: null }, // rpc
    ])
    const res = await getCrossLanguage(client, 'en:dog')
    expect(res.map((r) => r.id)).toEqual(['es:perro', 'zh:狗'])
    expect(res[0]).toMatchObject({ glossVi: 'con chó', glossEn: 'dog' })
  })

  it('maps the matcher result for a non-English word', async () => {
    const client = crossClient([
      { data: { lang: 'zh', headword_normalized: '狗', senses: [{ gloss_en: 'dog' }] }, error: null }, // source
      { data: [sib('en:dog', 'en', 'dog', 'con chó', 'dog'), sib('es:perro', 'es', 'perro', null, 'dog')], error: null }, // rpc
    ])
    const res = await getCrossLanguage(client, 'zh:狗')
    expect(res.map((r) => r.id)).toEqual(['en:dog', 'es:perro'])
  })

  it('returns [] without calling the matcher when the gloss yields no usable pivot', async () => {
    const client = crossClient([
      { data: { lang: 'zh', headword_normalized: '吧', senses: [{ gloss_en: '(particle); marker' }] }, error: null },
    ])
    expect(await getCrossLanguage(client, 'zh:吧')).toEqual([])
  })

  it('returns [] when the entry is not found', async () => {
    const client = crossClient([{ data: null, error: null }])
    expect(await getCrossLanguage(client, 'en:nope')).toEqual([])
  })
})

describe('getCharacters', () => {
  it('maps each Han glyph in order, repeats included', async () => {
    const client = queueClient([
      { data: [{ char: '人', radical: '人', stroke_count: 2, han_viet: ['nhân'], pinyin: ['rén'], gloss: 'person' }], error: null },
    ])
    const res = await getCharacters(client, '人人')
    expect(res).toHaveLength(2)
    expect(res[0]).toEqual({ char: '人', radical: '人', strokeCount: 2, hanViet: ['nhân'], pinyin: ['rén'], gloss: 'person' })
  })

  it('returns [] for non-Han input without querying', async () => {
    const client = queueClient([])
    expect(await getCharacters(client, 'dog')).toEqual([])
  })
})

// Thenable builder: every method returns the builder, awaiting it yields the next
// queued result. Handles any chain shape (the terminal method varies per query).
function thenableClient(results: { data: unknown; error: null }[]) {
  let i = 0
  const builder: Record<string, unknown> = {
    then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
      resolve(results[i++] ?? { data: [], error: null }),
  }
  for (const m of ['select', 'eq', 'in', 'order', 'limit']) builder[m] = () => builder
  return {
    schema: () => ({ from: () => builder }),
  } as unknown as import('@supabase/supabase-js').SupabaseClient
}

const dogRow = {
  id: 'en:dog', lang: 'en', headword: 'dog', traditional: null, level: 'A1', frequency_rank: 500, attributes: {},
  senses: [{ pos: 'noun', gloss_vi: 'con chó', gloss_en: 'dog', sense_order: 1 }],
  pronunciations: [{ accent: 'en-US', ipa: '/dɔːɡ/', audio_url: null }],
}

describe('resolveTokens', () => {
  it('resolves a token by direct headword match', async () => {
    const client = thenableClient([{ data: [dogRow], error: null }])
    const map = await resolveTokens(client, 'en', ['Dog'])
    expect(map.get('dog')).toMatchObject({ id: 'en:dog', glossVi: 'con chó' })
  })

  it('resolves an inflected form via the inflections table', async () => {
    const client = thenableClient([
      { data: [], error: null },                                    // direct headword: none
      { data: [{ form_text: 'dogs', entry_id: 'en:dog' }], error: null }, // inflections
      { data: [dogRow], error: null },                              // entries by id
    ])
    const map = await resolveTokens(client, 'en', ['dogs'])
    expect(map.get('dogs')).toMatchObject({ id: 'en:dog', headword: 'dog' })
  })

  it('returns an empty map when nothing matches', async () => {
    const client = thenableClient([{ data: [], error: null }, { data: [], error: null }])
    expect((await resolveTokens(client, 'en', ['zzzz'])).size).toBe(0)
  })

  it('does not query for empty token list', async () => {
    const client = thenableClient([])
    expect((await resolveTokens(client, 'en', [])).size).toBe(0)
  })
})

describe('getZhSegmentCandidates', () => {
  it('returns the matched headword strings for candidate substrings found in the text', async () => {
    const client = thenableClient([{ data: [{ headword: '你好' }, { headword: '好' }], error: null }])
    expect(await getZhSegmentCandidates(client, '你好吗')).toEqual(['你好', '好'])
  })

  it('returns [] without querying when the text has no multi-character Han run', async () => {
    const client = thenableClient([])
    expect(await getZhSegmentCandidates(client, 'a')).toEqual([])
    expect(await getZhSegmentCandidates(client, '')).toEqual([])
  })
})
