import { describe, it, expect, vi } from 'vitest'
import { pickIpa, pickPrimarySense, toSenses } from '@/lib/dictionary/rows'
import { searchEntries, searchAllLanguages, searchAllLanguagesVi, suggestNearby, searchOneDirection, getCommonWords } from '@/lib/dictionary/search'
import { clientReturning } from './helpers/supabase'
import { getEntryDetail, getCrossLanguage, getCharacters } from '@/lib/dictionary/entryDetail'
import { resolveTokens, getZhSegmentCandidates } from '@/lib/dictionary/resolveTokens'

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

describe('toSenses', () => {
  it('orders senses by sense_order whatever order the rows arrive in', () => {
    const row = (sense_order: number, gloss_vi: string) => ({ pos: 'noun', gloss_vi, gloss_en: null, sense_order })
    expect(toSenses([row(6, 'chàng trai'), row(1, 'gà'), row(2, 'thịt gà')]).map((s) => s.glossVi))
      .toEqual(['Gà', 'Thịt gà', 'Chàng trai'])
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
        attributes: {}, pos: 'noun', gloss_vi: 'con chó', gloss_en: 'dog', ipa: '/dɔːɡ/',
        audio_url: 'https://upload.wikimedia.org/wikipedia/commons/1/15/En-uk-dog.ogg', rank: 0.9,
      },
    ])
    const res = await searchEntries(client, 'en', 'dog')
    expect(res[0]).toMatchObject({
      id: 'en:dog', headword: 'dog', ipa: '/dɔːɡ/', glossVi: 'Con chó', pos: 'noun', level: 'A1',
      audioUrl: 'https://upload.wikimedia.org/wikipedia/commons/1/15/En-uk-dog.ogg',
    })
  })

  it('drops a recording that is of a phrase rather than the word', async () => {
    // En-uk-a_cat.ogg says "a cat". It was sitting on the entry for "cat", and the
    // wordlist saved it with the word, so the review card said "a cat" too.
    const { client } = rpcClient([
      {
        id: 'en:cat', lang: 'en', headword: 'cat', traditional: null, level: 'A1', frequency_rank: 300,
        attributes: {}, pos: 'noun', gloss_vi: 'con mèo', gloss_en: 'cat', ipa: 'kæt',
        audio_url: 'https://upload.wikimedia.org/wikipedia/commons/1/1e/En-uk-a_cat.ogg?utm_source=x', rank: 4,
      },
    ])
    const res = await searchEntries(client, 'en', 'cat')
    expect(res[0].audioUrl).toBeNull()
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

function viRow(id: string, lang: string, headword: string) {
  return {
    id, lang, headword, traditional: null, level: null, frequency_rank: null,
    attributes: null, pos: null, gloss_vi: null, gloss_en: null, ipa: null,
    audio_url: null, rank: 1,
  }
}

describe('searchAllLanguagesVi', () => {
  it('asks the database once and splits the rows by language', async () => {
    const { client, rpc } = rpcClient([
      viRow('en:get', 'en', 'get'),
      viRow('en:got', 'en', 'got'),
      viRow('zh:收', 'zh', '收'),
    ])
    const out = await searchAllLanguagesVi(client, 'nhận được', 8)

    // Three calls, one per language, meant paying for the same gloss scan three
    // times; the scan barely shrinks when the language is narrowed.
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('search_vi', { p_q: 'nhận được', p_langs: ['en', 'es', 'zh'], p_limit: 8 })
    expect(out.en.map((e) => e.headword)).toEqual(['get', 'got'])
    expect(out.zh.map((e) => e.headword)).toEqual(['收'])
    expect(out.es).toEqual([])
  })

  // The quota moved into lex.search_vi in 0047, which applies it per language before
  // ranking. Capping again here would throw away rows the database had already
  // reserved for that language.
  it('keeps every row the database allotted to a language', async () => {
    const { client } = rpcClient([
      viRow('en:a', 'en', 'a'), viRow('en:b', 'en', 'b'), viRow('en:c', 'en', 'c'),
      viRow('zh:d', 'zh', 'd'),
    ])
    const out = await searchAllLanguagesVi(client, 'x', 2)
    expect(out.en.map((e) => e.headword)).toEqual(['a', 'b', 'c'])
    expect(out.zh.map((e) => e.headword)).toEqual(['d'])
  })

  // SQLSTATE 57014 is the statement timeout. Answering it as an empty result was tried
  // and measured: "cái bàn" costs 122 ms warm and returns table, tables, mesa and tabla,
  // but on a cold read it crossed the 3 s the anon role allows and the learner was shown
  // a page saying their word is in no language. The route turns this into a 503.
  it('raises on the statement timeout rather than calling the dictionary empty', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }))
    const client = { schema: () => ({ rpc }) } as unknown as import('@supabase/supabase-js').SupabaseClient
    await expect(searchAllLanguagesVi(client, 'nhận được')).rejects.toMatchObject({ code: '57014' })
  })

  it('still raises any other database error', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: '42883', message: 'operator does not exist' } }))
    const client = { schema: () => ({ rpc }) } as unknown as import('@supabase/supabase-js').SupabaseClient
    await expect(searchAllLanguagesVi(client, 'nhận được')).rejects.toMatchObject({ code: '42883' })
  })

  it('skips the round trip on an empty query', async () => {
    const { client, rpc } = rpcClient([])
    await searchAllLanguagesVi(client, '   ', 8)
    expect(rpc).not.toHaveBeenCalled()
  })
})


describe('suggestNearby', () => {
  it('maps the lex.suggest RPC row to a suggestion', async () => {
    const { client } = rpcClient([{ id: 'en:receive', lang: 'en', headword: 'receive', gloss_vi: 'nhận được', kind: 'headword', score: 0.5 }])
    const res = await suggestNearby(client, 'recieve')
    expect(res).toEqual([{ id: 'en:receive', lang: 'en', headword: 'receive', glossVi: 'Nhận được', kind: 'headword' }])
  })

  it('returns [] without calling the RPC for an empty query', async () => {
    const { client, rpc } = rpcClient([])
    expect(await suggestNearby(client, '  ')).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('searchOneDirection', () => {
  it('runs only lex.search for the foreign direction, never search_vi', async () => {
    const { client, rpc } = namedRpcClient({ search: [receiveViRow] })
    const res = await searchOneDirection(client, 'receive', 'fw')
    expect(res.entries.en).toHaveLength(1)
    expect(res.suggestions).toEqual([])
    // One call per language (searchAllLanguages), all against lex.search.
    expect(rpc.mock.calls.every(([name]) => name === 'search')).toBe(true)
    expect(rpc).toHaveBeenCalledWith('search', expect.objectContaining({ p_q: 'receive' }))
  })

  it('runs only lex.search_vi for the Vietnamese direction', async () => {
    const { client, rpc } = namedRpcClient({ search_vi: [receiveViRow] })
    const res = await searchOneDirection(client, 'nhận được', 'vi')
    expect(res.entries.en).toHaveLength(1)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('search_vi', expect.objectContaining({ p_q: 'nhận được' }))
  })

  it('suggests nearby matches, kept to the searched side, only when entries come back empty', async () => {
    const { client, rpc } = namedRpcClient({
      suggest: [
        { id: 'en:receive', lang: 'en', headword: 'receive', gloss_vi: 'nhận được', kind: 'headword', score: 0.5 },
        { id: 'en:receipt', lang: 'en', headword: 'receipt', gloss_vi: 'hoá đơn', kind: 'gloss_vi', score: 0.4 },
      ],
    })
    const res = await searchOneDirection(client, 'zzzz', 'fw')
    expect(res.suggestions).toEqual([{ id: 'en:receive', lang: 'en', headword: 'receive', glossVi: 'Nhận được', kind: 'headword' }])
    expect(rpc).toHaveBeenCalledWith('suggest', expect.objectContaining({ p_q: 'zzzz' }))
  })

  it('keeps only gloss_vi suggestions for the Vietnamese direction', async () => {
    const { client } = namedRpcClient({
      suggest: [
        { id: 'en:receive', lang: 'en', headword: 'receive', gloss_vi: 'nhận được', kind: 'headword', score: 0.5 },
        { id: 'en:receipt', lang: 'en', headword: 'receipt', gloss_vi: 'hoá đơn', kind: 'gloss_vi', score: 0.4 },
      ],
    })
    const res = await searchOneDirection(client, 'zzzz', 'vi')
    expect(res.suggestions.map((s) => s.id)).toEqual(['en:receipt'])
  })

  it('does not suggest when entries were found', async () => {
    const { client, rpc } = namedRpcClient({ search: [receiveViRow] })
    await searchOneDirection(client, 'receive', 'fw')
    expect(rpc).not.toHaveBeenCalledWith('suggest', expect.anything())
  })

  it('returns empty without calling any RPC for an empty query', async () => {
    const { client, rpc } = namedRpcClient({})
    const res = await searchOneDirection(client, '   ', 'fw')
    expect(res).toEqual({ entries: { en: [], zh: [], es: [] }, suggestions: [] })
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
  ({ id, lang, headword, reading: null, gender: null, pos: null, gloss_vi, gloss_en })

/** A `lex.search_vi` row, which is the search shape rather than the sibling shape. */
const viHit = (id: string, lang: string, headword: string, pinyin: string | null = null) => ({
  id, lang, headword, traditional: null, level: null, frequency_rank: null,
  attributes: pinyin ? { pinyin } : null, pos: null, gloss_vi: null, gloss_en: null,
  ipa: null, audio_url: null, rank: 2,
})

describe('getCrossLanguage', () => {
  it('maps the matcher result for an English word, snake_case to camelCase', async () => {
    const client = crossClient([
      { data: { lang: 'en', headword_normalized: 'dog', senses: [{ gloss_en: 'dog', gloss_vi: 'con chó' }] }, error: null }, // source
      { data: [sib('es:perro', 'es', 'perro', 'con chó', 'dog'), sib('zh:狗', 'zh', '狗', null, 'dog')], error: null }, // rpc
    ])
    const res = await getCrossLanguage(client, 'en:dog')
    expect(res.map((r) => r.id)).toEqual(['es:perro', 'zh:狗'])
    expect(res[0]).toMatchObject({ glossVi: 'Con chó', glossEn: 'dog' })
  })

  it('maps the matcher result for a non-English word', async () => {
    const client = crossClient([
      { data: { lang: 'zh', headword_normalized: '狗', senses: [{ gloss_en: 'dog', gloss_vi: 'con chó' }] }, error: null }, // source
      { data: [sib('en:dog', 'en', 'dog', 'con chó', 'dog'), sib('es:perro', 'es', 'perro', null, 'dog')], error: null }, // rpc
    ])
    const res = await getCrossLanguage(client, 'zh:狗')
    expect(res.map((r) => r.id)).toEqual(['en:dog', 'es:perro'])
  })

  it('returns [] without calling the matcher when the gloss yields no usable pivot', async () => {
    const client = crossClient([
      { data: { lang: 'zh', headword_normalized: '吧', senses: [{ gloss_en: '(particle); marker', gloss_vi: null }] }, error: null },
    ])
    expect(await getCrossLanguage(client, 'zh:吧')).toEqual([])
  })

  // The shape that left the panel empty on `adjourned` and `postponed`: the
  // matcher wants a target gloss equal to the pivot whole, and the glosses are
  // written as lists.
  it('falls back to the Vietnamese meaning for a language the matcher missed', async () => {
    const client = crossClient([
      { data: { lang: 'en', headword_normalized: 'contract', senses: [{ gloss_en: 'contract', gloss_vi: 'hợp đồng' }] }, error: null },
      { data: [], error: null }, // match_cross_language: nothing
      { data: [viHit('es:contrato', 'es', 'contrato'), viHit('zh:合同', 'zh', '合同', '合同')], error: null },
    ])
    const res = await getCrossLanguage(client, 'en:contract')
    expect(res.map((r) => r.id)).toEqual(['es:contrato', 'zh:合同'])
    expect(res.find((r) => r.lang === 'zh')?.reading).toBe('合同')
  })

  it('keeps what the matcher found and fills only the language it left empty', async () => {
    const client = crossClient([
      { data: { lang: 'en', headword_normalized: 'dog', senses: [{ gloss_en: 'dog', gloss_vi: 'con chó' }] }, error: null },
      { data: [sib('es:perro', 'es', 'perro', 'con chó', 'dog')], error: null },
      { data: [viHit('es:cachorro', 'es', 'cachorro'), viHit('zh:狗', 'zh', '狗', 'gǒu')], error: null },
    ])
    const res = await getCrossLanguage(client, 'en:dog')
    expect(res.map((r) => r.id)).toEqual(['es:perro', 'zh:狗'])
  })

  it('does not ask twice when the matcher covered every other language', async () => {
    const client = crossClient([
      { data: { lang: 'en', headword_normalized: 'dog', senses: [{ gloss_en: 'dog', gloss_vi: 'con chó' }] }, error: null },
      { data: [sib('es:perro', 'es', 'perro', null, 'dog'), sib('zh:狗', 'zh', '狗', null, 'dog')], error: null },
      { data: [viHit('es:nope', 'es', 'nope')], error: null }, // must not be consumed
    ])
    const res = await getCrossLanguage(client, 'en:dog')
    expect(res.map((r) => r.id)).toEqual(['es:perro', 'zh:狗'])
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
  // `rpc` draws from the same queue as the table reads, so a case still lists its
  // results in the order the code asks for them. resolveTokens reads entries
  // through the table builder and inflections through lex.resolve_inflections.
  return {
    schema: () => ({
      from: () => builder,
      rpc: () => Promise.resolve(results[i++] ?? { data: [], error: null }),
    }),
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
    expect(map.get('dog')).toMatchObject({ id: 'en:dog', glossVi: 'Con chó' })
  })

  it('resolves an inflected form through lex.resolve_inflections', async () => {
    const client = thenableClient([
      { data: [], error: null },                                    // direct headword: none
      { data: [{ form_text: 'dogs', entry_id: 'en:dog' }], error: null }, // lex.resolve_inflections
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

describe('searchAllLanguages trigram gate', () => {
  const row = (id: string, lang: string, rank: number) => ({
    id, lang, headword: id, traditional: null, level: null, frequency_rank: null,
    attributes: null, pos: null, gloss_vi: null, gloss_en: null, ipa: null,
    audio_url: null, rank,
  })

  function clientReturning(byLang: Record<string, ReturnType<typeof row>[]>) {
    return {
      schema: () => ({
        rpc: (_name: string, args: { p_langs: string[] }) =>
          Promise.resolve({ data: byLang[args.p_langs[0]] ?? [], error: null }),
      }),
    } as unknown as Parameters<typeof searchAllLanguages>[0]
  }

  it('drops a trigram guess where another language matched structurally', async () => {
    const out = await searchAllLanguages(clientReturning({
      en: [row('fish', 'en', 4.5)],
      es: [row('fiscal', 'es', 1.58), row('fi', 'es', 1.17)],
      zh: [],
    }), 'fish')
    expect(out.en.map((e) => e.id)).toEqual(['fish'])
    expect(out.es).toEqual([])
  })

  it('keeps every guess where no language matched structurally', async () => {
    const out = await searchAllLanguages(clientReturning({
      en: [row('receive', 'en', 1.9)],
      es: [row('recibir', 'es', 1.2)],
      zh: [],
    }), 'recieve')
    expect(out.en.map((e) => e.id)).toEqual(['receive'])
    expect(out.es.map((e) => e.id)).toEqual(['recibir'])
  })
})

describe('getCommonWords', () => {
  it('drops the uncurated rows when asked for levelled words only', async () => {
    const not = vi.fn()
    const built = clientReturning([], null, {
      not: (...args: unknown[]) => { not(...args); return built.builder },
    })
    await getCommonWords(built.client, 'en', { limit: 10, offset: 300, leveled: true })
    expect(not).toHaveBeenCalledWith('level', 'is', null)
  })

  it('keeps every row when it is not asked to', async () => {
    const not = vi.fn()
    const built = clientReturning([], null, {
      not: (...args: unknown[]) => { not(...args); return built.builder },
    })
    await getCommonWords(built.client, 'en')
    expect(not).not.toHaveBeenCalled()
  })
})
