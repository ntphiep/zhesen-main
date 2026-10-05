import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const { azureTranslatorConfig, translateCached } = vi.hoisted(() => ({
  azureTranslatorConfig: vi.fn(),
  translateCached: vi.fn(),
}))
vi.mock('@/lib/translate/config', () => ({ azureTranslatorConfig }))
vi.mock('@/lib/translate/azure', () => ({ translateCached }))

import { searchOneDirection } from '@/lib/dictionary/search'

function row(id: string, headword: string, rank: number) {
  return {
    id, lang: id.slice(0, 2), headword, traditional: null, level: null, frequency_rank: null,
    attributes: null, pos: null, gloss_vi: null, gloss_en: null, ipa: null, audio_url: null, rank,
  }
}

/** lex.search_vi answers `viRows`; lex.search answers by the query it is given. */
function client(viRows: unknown[], search: Record<string, unknown[]>) {
  const rpc = vi.fn(async (name: string, args: { p_q: string }) =>
    ({ data: name === 'search_vi' ? viRows : name === 'search' ? search[args.p_q] ?? [] : [], error: null }))
  return { client: { schema: () => ({ rpc }) } as unknown as SupabaseClient, rpc }
}

const CFG = { endpoint: 'https://azure.test', key: 'k', region: 'r' }

beforeEach(() => {
  azureTranslatorConfig.mockReset().mockReturnValue(CFG)
  translateCached.mockReset()
})

describe('searchOneDirection, Vietnamese fallback through a translation', () => {
  it('searches a thin language for the translation and keeps only new word-level hits', async () => {
    translateCached.mockResolvedValue({ from: 'vi', translations: { en: 'Attendees' } })
    const { client: c, rpc } = client(
      [row('en:participant', 'participant', 3.85), row('en:participator', 'participator', 3.85)],
      { attendees: [
        row('en:attendees', 'attendees', 4.0),
        row('en:attendee', 'attendee', 3.5),
        row('en:participant', 'participant', 4.0),
        row('en:attendeeship', 'attendeeship', 3.0),
        row('en:attention', 'attention', 1.8),
      ] },
    )

    const res = await searchOneDirection(c, 'người tham dự', 'vi', 8, ['en'])

    expect(res.entries.en.map((e) => e.headword)).toEqual(['participant', 'participator'])
    expect(res.translated?.en?.text).toBe('Attendees')
    expect(res.translated?.en?.entries.map((e) => e.headword)).toEqual(['attendees', 'attendee'])
    expect(translateCached).toHaveBeenCalledTimes(1)
    expect(translateCached.mock.calls[0].slice(1, 4)).toEqual(['người tham dự', 'vi', ['en']])
    expect(rpc).toHaveBeenCalledWith('search', expect.objectContaining({ p_q: 'attendees', p_langs: ['en'] }))
  })

  it('asks Azure once for every thin language and never for a full one', async () => {
    translateCached.mockResolvedValue({ from: 'vi', translations: { es: 'escuela', zh: '学校' } })
    const full = Array.from({ length: 3 }, (_, i) => row(`en:w${i}`, `w${i}`, 4))
    const { client: c } = client(full, {})

    await searchOneDirection(c, 'trường', 'vi', 8, ['en', 'es', 'zh'])

    expect(translateCached).toHaveBeenCalledTimes(1)
    expect(translateCached.mock.calls[0][3]).toEqual(['es', 'zh'])
  })

  it('costs nothing extra when every language has enough native hits', async () => {
    const full = Array.from({ length: 3 }, (_, i) => row(`en:w${i}`, `w${i}`, 4))
    const { client: c, rpc } = client(full, {})

    const res = await searchOneDirection(c, 'ăn', 'vi', 8, ['en'])

    expect(translateCached).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(res.translated).toBeUndefined()
  })

  it('does nothing without an Azure key', async () => {
    azureTranslatorConfig.mockReturnValue(null)
    const { client: c, rpc } = client([row('en:field', 'field', 3.9)], {})

    const res = await searchOneDirection(c, 'trường', 'vi', 8, ['en'])

    expect(translateCached).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(res.entries.en).toHaveLength(1)
    expect(res.translated).toBeUndefined()
  })

  it('answers the native hits when Azure fails', async () => {
    translateCached.mockRejectedValue(new Error('HTTP 429'))
    const { client: c } = client([row('en:field', 'field', 3.9)], {})

    const res = await searchOneDirection(c, 'trường', 'vi', 8, ['en'])

    expect(res.entries.en.map((e) => e.headword)).toEqual(['field'])
    expect(res.translated).toBeUndefined()
  })

  // The route keeps such an answer out of every cache, so it has to be told.
  it('says the translation failed when Azure fails', async () => {
    translateCached.mockRejectedValue(new DOMException('timed out', 'TimeoutError'))
    const { client: c } = client([row('en:field', 'field', 3.9)], {})

    const res = await searchOneDirection(c, 'trường', 'vi', 8, ['en'])

    expect(res.translationFailed).toBe(true)
  })

  it('reports no failure when the translation found nothing new', async () => {
    translateCached.mockResolvedValue({ from: 'vi', translations: { en: 'field' } })
    const { client: c } = client([row('en:field', 'field', 3.9)], { field: [row('en:field', 'field', 4)] })

    const res = await searchOneDirection(c, 'trường', 'vi', 8, ['en'])

    expect(res.translated).toBeUndefined()
    expect(res.translationFailed).toBeUndefined()
  })

  it('never translates in the foreign direction', async () => {
    const { client: c } = client([], { dog: [] })
    await searchOneDirection(c, 'dog', 'fw', 8, ['en'])
    expect(translateCached).not.toHaveBeenCalled()
  })
})
