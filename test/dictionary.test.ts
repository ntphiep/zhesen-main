import { describe, it, expect, vi } from 'vitest'
import { pickIpa, pickPrimarySense, searchEntries, getEntryDetail } from '@/lib/dictionary/search'

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
