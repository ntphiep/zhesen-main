import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { queryBuilder } from './helpers/supabase'
import { WARRANTY_LAYER_ROW } from './helpers/learner'
import { isOpenLicence } from '@/lib/dictionary/licence'
import { getEntryDetail } from '@/lib/dictionary/entryDetail'
import { parseLearnerLayer } from '@/lib/dictionary/learner'

// The owner's decision of 2026-10-05: a sentence from a source with no open licence is not
// shown. lex.sources lists cambridge as "proprietary" and leaves glosbe and cambridge-vi empty.
describe('isOpenLicence', () => {
  it('refuses an empty or proprietary licence and accepts a named one', () => {
    expect(isOpenLicence('proprietary')).toBe(false)
    expect(isOpenLicence('')).toBe(false)
    expect(isOpenLicence(null)).toBe(false)
    expect(isOpenLicence('CC BY 2.0 FR')).toBe(true)
    expect(isOpenLicence('machine output')).toBe(true)
  })
})

describe('getEntryDetail examples', () => {
  // en:borrow showed "He borrowed a book from the library." from Cambridge.
  it('keeps only the examples whose source carries an open licence', async () => {
    const row = (text: string, source_id: string, license: string | null) => ({
      text, reading: null, translation_vi: null, translation_en: null, sense_id: null, source_id, sources: { license },
    })
    const examples = queryBuilder({ data: [
      row('He borrowed a book from the library.', 'cambridge', 'proprietary'),
      row('Can I borrow your pen?', 'tatoeba', 'CC BY 2.0 FR'),
      row('I borrowed money.', 'glosbe', null),
    ], error: null })
    const entries = queryBuilder({ data: {
      id: 'en:borrow', lang: 'en', headword: 'borrow', traditional: null, level: 'A2', frequency_rank: null,
      attributes: null, senses: [], pronunciations: [], lex_relations: [],
    }, error: null })
    const from = vi.fn((table: string) => (table === 'examples' ? examples : entries))
    const client = { schema: () => ({ from, rpc: async () => ({ data: [], error: null }) }) } as unknown as SupabaseClient

    const detail = await getEntryDetail(client, 'en:borrow')

    expect(examples.select).toHaveBeenCalledWith(expect.stringContaining('sources(license)'))
    expect(detail?.examples.map((e) => e.text)).toEqual(['Can I borrow your pen?'])
  })
})

describe('parseLearnerLayer examples', () => {
  const withSources = (licences: (string | null | undefined)[]) => {
    const [first, ...rest] = WARRANTY_LAYER_ROW.learner_senses
    return {
      ...WARRANTY_LAYER_ROW,
      learner_senses: [
        {
          ...first,
          learner_examples: licences.map((license, i) => ({
            ...first.learner_examples[0], example_order: i + 1, text: `sentence ${i}`,
            examples: license === undefined ? null : { source_id: 'x', sources: { license } },
          })),
        },
        ...rest,
      ],
    }
  }

  // 1,246 of 23,114 learner examples were copied from cambridge or glosbe.
  it('drops an example copied from a source without an open licence', () => {
    const layer = parseLearnerLayer(withSources(['proprietary', 'CC BY 2.0 FR', null, undefined]))
    expect(layer.senses[0].examples.map((x) => x.text)).toEqual(['sentence 1', 'sentence 3'])
  })
})
