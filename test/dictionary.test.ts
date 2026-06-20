import { describe, it, expect, vi } from 'vitest'
import { pickIpa, pickPrimarySense, searchEntries, getEntryDetail, getCrossLanguage, getCharacters, resolveTokens, getHeadwords } from '@/lib/dictionary/search'

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

describe('searchEntries', () => {
  it('maps rows to previews with chosen ipa and primary sense', async () => {
    const client = mockClient([
      {
        id: 'en:dog', lang: 'en', headword: 'dog', traditional: null, level: 'A1', attributes: {},
        senses: [{ pos: 'noun', gloss_vi: 'con chó', gloss_en: 'dog', sense_order: 1 }],
        pronunciations: [{ accent: 'en-US', ipa: '/dɔːɡ/', audio_url: 'x.ogg' }],
      },
    ])
    const res = await searchEntries(client, 'en', 'dog')
    expect(res[0]).toMatchObject({ id: 'en:dog', headword: 'dog', ipa: '/dɔːɡ/', glossVi: 'con chó', pos: 'noun', audioUrl: 'x.ogg', level: 'A1' })
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

describe('getCrossLanguage', () => {
  it('returns only siblings that exist as entries', async () => {
    const client = queueClient([
      { data: [{ concept_id: 'Q144' }], error: null },               // eq from_entry_id
      { data: [], error: null },                                      // eq to_entry_id
      { data: [                                                       // in concept_id
        { from_entry_id: 'en:dog', to_entry_id: 'es:perro' },
        { from_entry_id: 'en:dog', to_entry_id: 'zh:狗' },
      ], error: null },
      { data: [                                                       // in id (only perro exists)
        { id: 'es:perro', lang: 'es', headword: 'perro', senses: [{ gloss_vi: 'con chó', sense_order: 1 }] },
      ], error: null },
    ])
    const res = await getCrossLanguage(client, 'en:dog')
    expect(res).toEqual([{ id: 'es:perro', lang: 'es', headword: 'perro', glossVi: 'con chó' }])
  })

  it('returns [] when the entry has no concepts', async () => {
    const client = queueClient([{ data: [], error: null }, { data: [], error: null }])
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
  id: 'en:dog', lang: 'en', headword: 'dog', traditional: null, level: 'A1', attributes: {},
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

describe('getHeadwords', () => {
  it('returns the headword strings for a language', async () => {
    const client = thenableClient([{ data: [{ headword: '你好' }, { headword: '好' }], error: null }])
    expect(await getHeadwords(client, 'zh')).toEqual(['你好', '好'])
  })
})
