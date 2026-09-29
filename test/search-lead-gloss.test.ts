import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { searchOneDirection } from '@/lib/dictionary/search'
import { queryBuilder } from './helpers/supabase'

// Rows as production returned them, trimmed to the senses that decide the pick.
function hit(id: string, headword: string, glossVi: string | null) {
  return {
    id, lang: 'en', headword, traditional: null, level: null, frequency_rank: null,
    attributes: null, pos: 'verb', gloss_vi: glossVi, gloss_en: null, ipa: null, audio_url: null, rank: 4,
  }
}

function entry(id: string, senses: [string, string, string, string | null][], layer: string[] | null = null, enDefinition: string | null = null) {
  return {
    id, lang: 'en', headword: id.slice(3), traditional: null, level: null, frequency_rank: null, attributes: null,
    senses: senses.map(([pos, gloss_vi, gloss_en, sense_frequency], i) => ({ pos, gloss_vi, gloss_en, sense_order: i + 1, sense_frequency })),
    pronunciations: [],
    learner_entries: layer
      ? { status: 'published', learner_senses: [{ sense_order: 1, vi_terms: layer, en_definition: enDefinition }] }
      : null,
  }
}

const take = entry('en:take', [
  ['verb', 'cầm, nắm', "To get into one's hands, possession, or control", null],
  ['verb', 'chiếm, bắt giữ, đoạt', 'To seize or capture.', null],
  ['verb', 'chiếm đoạt, lấy', "To appropriate or transfer into one's own possession", '1'],
], ['lấy', 'cầm', 'nắm'], 'To get something into your hands or possession.')

const were = entry('en:were', [
  ['verb', 'thì, là, ở', 'simple subjunctive of be', '3'],
  ['noun', 'người hóa thú', 'The collective name for any kind of person that changes into another form', '1'],
  ['verb', 'ngôi thứ hai số ít quá khứ của be', 'second-person singular simple past indicative of be', '2'],
  ['verb', 'đã là, đã ở', 'plural simple past indicative of be', '1'],
])

const are = entry('en:are', [
  ['noun', 'a, a-rơ', 'An accepted (but deprecated and rarely used) metric unit of area', null],
  ['verb', 'ngôi thứ hai số ít hiện tại của be', 'second-person singular simple present of be', '1'],
], ['thì', 'là', 'ở', 'đang'], "present tense of the verb 'be', used with 'you', 'we', 'they' and plural nouns")

/** lex.search and lex.suggest answer by RPC name; `lex.entries` answers `entries`. */
function client(rpcData: Record<string, unknown[]>, entries: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async (name: string) => ({ data: rpcData[name] ?? [], error: null }))
  const builder = queryBuilder(entries)
  const from = vi.fn(() => builder)
  return { client: { schema: () => ({ rpc, from }) } as unknown as SupabaseClient, from, builder }
}

describe('searchOneDirection, the lead meaning of each hit', () => {
  it("shows take's learner-layer first meaning, fetched for every hit in one query", async () => {
    const { client: c, from, builder } = client(
      { search: [hit('en:take', 'take', 'cầm, nắm'), hit('en:takeover', 'takeover', 'chiếm')] },
      { data: [take], error: null },
    )

    const res = await searchOneDirection(c, 'take', 'fw', 8, ['en'])

    expect(res.entries.en[0]).toMatchObject({
      headword: 'take', glossVi: 'Lấy, cầm, nắm', glossEn: 'To get something into your hands or possession.',
    })
    // An id the second query did not return keeps lex.search's gloss.
    expect(res.entries.en[1]).toMatchObject({ headword: 'takeover', glossVi: 'Chiếm' })
    expect(from).toHaveBeenCalledTimes(1)
    expect(builder.in).toHaveBeenCalledWith('id', ['en:take', 'en:takeover'])
  })

  it('shows the pickPrimarySense choice for an entry without a layer, so were keeps the verb', async () => {
    const { client: c } = client({ search: [hit('en:were', 'were', 'thì, là, ở')] }, { data: [were], error: null })
    const res = await searchOneDirection(c, 'were', 'fw', 8, ['en'])
    expect(res.entries.en[0]).toMatchObject({ glossVi: 'Đã là, đã ở', glossEn: 'plural simple past indicative of be' })
  })

  it('keeps the verb for are, whose sense 1 is a noun', async () => {
    const { client: c } = client({ search: [hit('en:are', 'are', 'a, a-rơ')] }, { data: [are], error: null })
    const res = await searchOneDirection(c, 'are', 'fw', 8, ['en'])
    expect(res.entries.en[0].glossVi).toBe('Thì, là, ở, đang')
  })

  it('gives a headword suggestion the same lead meaning', async () => {
    const { client: c } = client(
      { suggest: [{ id: 'en:were', lang: 'en', headword: 'were', gloss_vi: 'thì, là, ở', kind: 'headword', score: 0.5 }] },
      { data: [were], error: null },
    )
    const res = await searchOneDirection(c, 'wera', 'fw', 8, ['en'])
    expect(res.suggestions).toEqual([{ id: 'en:were', lang: 'en', headword: 'were', glossVi: 'Đã là, đã ở', kind: 'headword' }])
  })

  it("keeps lex.search's gloss when the second query fails", async () => {
    const { client: c } = client(
      { search: [hit('en:take', 'take', 'cầm, nắm')] },
      { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } },
    )
    const res = await searchOneDirection(c, 'take', 'fw', 8, ['en'])
    expect(res.entries.en[0].glossVi).toBe('Cầm, nắm')
  })

  it('leaves the Vietnamese direction on the sense that matched', async () => {
    const { client: c, from } = client(
      { search_vi: [hit('en:take', 'take', 'chiếm, bắt giữ, đoạt'), hit('en:w1', 'w1', null), hit('en:w2', 'w2', null)] },
      { data: [take], error: null },
    )
    const res = await searchOneDirection(c, 'chiếm', 'vi', 8, ['en'])
    expect(res.entries.en[0].glossVi).toBe('Chiếm, bắt giữ, đoạt')
    expect(from).not.toHaveBeenCalled()
  })
})
