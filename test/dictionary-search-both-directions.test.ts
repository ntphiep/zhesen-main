import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { searchBothDirections } from '@/lib/dictionary/search'

const row = (lang: string, headword: string, rank: number) => ({
  id: `${lang}:${headword}`, lang, headword, traditional: null, level: null,
  frequency_rank: null, attributes: null, pos: null, gloss_vi: null, gloss_en: null,
  ipa: null, audio_url: null, rank,
})

/**
 * Records which RPCs ran. `search` answers per language from `forward`;
 * `search_vi` answers from `reverse`; `suggest` answers empty.
 */
function mockClient(forward: Record<string, number[]>, reverse: string[] = []) {
  const rpc = vi.fn(async (fn: string, args: { p_langs?: string[] }) => {
    if (fn === 'search') {
      const lang = args.p_langs?.[0] ?? 'en'
      const ranks = forward[lang] ?? []
      return { data: ranks.map((r, i) => row(lang, `${lang}${i}`, r)), error: null }
    }
    if (fn === 'search_vi') {
      return { data: reverse.map((h) => row('zh', h, 5)), error: null }
    }
    return { data: [], error: null }
  })
  const client = { schema: () => ({ rpc }) } as unknown as SupabaseClient
  const called = (fn: string) => rpc.mock.calls.some(([name]) => name === fn)
  return { client, rpc, called }
}

describe('searchBothDirections', () => {
  it('skips the reverse lookup when the forward search found the word itself', async () => {
    const { client, called } = mockClient({ en: [4.02], es: [], zh: [] })
    const out = await searchBothDirections(client, 'dog')
    expect(out.forward.en).toHaveLength(1)
    expect(called('search_vi')).toBe(false)
  })

  it('runs the reverse lookup when the forward search only guessed', async () => {
    // "nhà" carries only à, which Spanish uses too, so looksVietnamese rightly
    // declines to claim it. The forward search answers with trigram guesses under
    // 1.0; treating those as "found something" used to hide the reverse lookup,
    // which is the one that actually answers the query.
    const { client, called } = mockClient({ en: [0.9, 0.8], es: [0.95], zh: [] }, ['家'])
    const out = await searchBothDirections(client, 'nhà')
    expect(called('search_vi')).toBe(true)
    expect(out.reverse.zh.map((e) => e.headword)).toEqual(['家'])
  })

  it('treats a prefix match as good enough to stay forward-only', async () => {
    // 3.0 is the prefix tier: the query really is the start of a word.
    const { client, called } = mockClient({ en: [3.0], es: [], zh: [] })
    await searchBothDirections(client, 'catal')
    expect(called('search_vi')).toBe(false)
  })

  it('runs the reverse lookup for a query written in Vietnamese, however well the forward search did', async () => {
    const { client, called } = mockClient({ en: [4.0], es: [], zh: [] }, ['吃'])
    await searchBothDirections(client, 'ăn')
    expect(called('search_vi')).toBe(true)
  })

  it('skips the reverse lookup for a Han query the forward search only matched loosely', async () => {
    // lex.search scores a PGroonga match at 1.5, under STRUCTURAL_MATCH, so every
    // Chinese query that is not an exact headword used to fall through to
    // lex.search_vi. Measured on 習: 780 to 1,195 ms for zero rows, and the search
    // route answered 500 on production when it crossed the statement timeout.
    // Vietnamese is written in Latin script, so the call can never answer.
    const { client, called } = mockClient({ en: [], es: [], zh: [1.5] })
    const out = await searchBothDirections(client, '習')
    expect(out.forward.zh).toHaveLength(1)
    expect(called('search_vi')).toBe(false)
  })

  it('still runs the reverse lookup for a Latin query that only guessed', async () => {
    const { client, called } = mockClient({ en: [1.5], es: [], zh: [] }, ['家'])
    await searchBothDirections(client, 'nha')
    expect(called('search_vi')).toBe(true)
  })

  it('asks for suggestions only when neither direction found anything', async () => {
    const { client, called } = mockClient({ en: [], es: [], zh: [] }, [])
    await searchBothDirections(client, 'qwertyuiop')
    expect(called('suggest')).toBe(true)

    const found = mockClient({ en: [], es: [], zh: [] }, ['家'])
    await searchBothDirections(found.client, 'nhà')
    expect(found.called('suggest')).toBe(false)
  })

  it('returns empty for a blank query without touching the database', async () => {
    const { client, rpc } = mockClient({ en: [4], es: [], zh: [] })
    const out = await searchBothDirections(client, '   ')
    expect(out).toEqual({
      forward: { en: [], zh: [], es: [] },
      reverse: { en: [], zh: [], es: [] },
      suggestions: [],
    })
    expect(rpc).not.toHaveBeenCalled()
  })
})
