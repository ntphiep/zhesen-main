import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getPhrasalVerbs } from '@/lib/dictionary/containing'
import { queryBuilder } from './helpers/supabase'

const containing = (headword: string) => ({
  id: `en:${headword}`, lang: 'en', headword, traditional: null,
  level: null, frequency_rank: null, gloss_vi: null, gloss_en: null,
})

const previewRow = (headword: string, glossVi: string) => ({
  id: `en:${headword}`, lang: 'en', headword, traditional: null, level: null, frequency_rank: null, attributes: null,
  senses: [
    { pos: 'verb', gloss_vi: 'đầu hàng', gloss_en: 'To surrender', sense_order: 1, sense_frequency: null },
    { pos: 'verb', gloss_vi: glossVi, gloss_en: 'To stop', sense_order: 2, sense_frequency: '1' },
  ],
  pronunciations: [],
  learner_entries: null,
})

/** The RPC answers through a builder, so the code can filter its rows; the previews come
 *  from `entries`. */
function client(rpcRows: unknown[], previews: unknown[]) {
  const filter = vi.fn()
  const limit = vi.fn()
  const rpcBuilder = queryBuilder({ data: rpcRows, error: null }, {})
  filter.mockReturnValue(rpcBuilder)
  limit.mockReturnValue(rpcBuilder)
  Object.assign(rpcBuilder, { filter, limit })
  const rpc = vi.fn(() => rpcBuilder)
  const from = vi.fn(() => queryBuilder({ data: previews, error: null }))
  const c = { schema: vi.fn(() => ({ rpc, from })) } as unknown as SupabaseClient
  return { c, rpc, filter, limit }
}

describe('getPhrasalVerbs', () => {
  it('asks for the verb plus one or two particles, in the RPC\'s order, with the lead meaning', async () => {
    const { c, rpc, filter, limit } = client(
      [containing('give up'), containing('give in')],
      [previewRow('give in', 'nhượng bộ'), previewRow('give up', 'từ bỏ')],
    )
    const out = await getPhrasalVerbs(c, 'give')
    expect(out.map((p) => [p.headword, p.glossVi])).toEqual([['give up', 'Từ bỏ'], ['give in', 'Nhượng bộ']])
    expect(rpc).toHaveBeenCalledWith('entries_containing', expect.objectContaining({ p_lang: 'en', p_text: 'give' }))
    const [column, op, pattern] = filter.mock.calls[0]
    expect([column, op]).toEqual(['headword', 'imatch'])
    const re = new RegExp(String(pattern), 'i')
    expect(['give up', 'give forward to', 'Give In'].every((h) => re.test(h))).toBe(true)
    expect(['give a damn', 'give up the ghost', 'forgive', 'give'].some((h) => re.test(h))).toBe(false)
    expect(limit).toHaveBeenCalledWith(24)
  })

  it('puts the PHaVE List\'s phrasal verbs first, in its order, and keeps the RPC\'s order for the rest', async () => {
    const { c } = client(
      [containing('get at'), containing('get by'), containing('get in'), containing('get back'), containing('get out')],
      ['get at', 'get by', 'get in', 'get back', 'get out'].map((h) => previewRow(h, h)),
    )
    const out = await getPhrasalVerbs(c, 'get')
    expect(out.map((p) => p.headword)).toEqual(['get out', 'get back', 'get in', 'get at', 'get by'])
  })

  it('asks nothing for a phrase or an empty word', async () => {
    const { c, rpc } = client([], [])
    expect(await getPhrasalVerbs(c, 'give up')).toEqual([])
    expect(await getPhrasalVerbs(c, '  ')).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })
})
