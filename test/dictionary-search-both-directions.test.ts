import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { searchBothDirections, searchVietnameseFirst } from '@/lib/dictionary/search'

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
    // declines to claim it. A forward trigram guess under 1.0 is not a real
    // match, so it must not suppress the reverse lookup, which is what actually
    // answers the query.
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
    // lex.search scores a PGroonga match at 1.5, under STRUCTURAL_MATCH, so a Han
    // query that is not an exact headword must not fall through to lex.search_vi:
    // Vietnamese is written in Latin script, so that call can never answer.
    // Measured on 習: 780 to 1,195 ms for zero rows, and the search route
    // answered 500 in production when it crossed the statement timeout.
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

describe('target languages', () => {
  it('asks the database only for the languages requested', async () => {
    const { client, rpc } = mockClient({ en: [4.02], es: [2], zh: [2] })
    const out = await searchBothDirections(client, 'dog', 8, ['en'])
    const asked = rpc.mock.calls.filter(([name]) => name === 'search').map(([, a]) => a.p_langs)
    expect(asked).toEqual([['en']])
    expect(out.forward.es).toEqual([])
    expect(out.forward.zh).toEqual([])
  })

  it('passes the same list to the Vietnamese lookup', async () => {
    const { client, rpc } = mockClient({ en: [], es: [], zh: [] }, ['家'])
    await searchBothDirections(client, 'nhà', 8, ['en', 'zh'])
    const vi = rpc.mock.calls.find(([name]) => name === 'search_vi')
    expect(vi?.[1].p_langs).toEqual(['en', 'zh'])
  })

  it('touches nothing when no language is wanted', async () => {
    const { client, rpc } = mockClient({ en: [4], es: [], zh: [] })
    const out = await searchBothDirections(client, 'dog', 8, [])
    expect(rpc).not.toHaveBeenCalled()
    expect(out.suggestions).toEqual([])
  })
})

describe('searchVietnameseFirst', () => {
  // The page declares the direction, so a Vietnamese word typed without tone marks
  // must not have to lose a forward search first.
  it('runs the Vietnamese lookup and never the forward search', async () => {
    const { client, called } = mockClient({ en: [4.02], es: [], zh: [] }, ['家'])
    const out = await searchVietnameseFirst(client, 'nha')
    expect(called('search_vi')).toBe(true)
    expect(called('search')).toBe(false)
    expect(out.forward).toEqual({ en: [], zh: [], es: [] })
    expect(out.reverse.zh.map((e) => e.headword)).toEqual(['家'])
  })

  it('falls back to suggestions when the Vietnamese lookup found nothing', async () => {
    const { client, called } = mockClient({ en: [], es: [], zh: [] }, [])
    await searchVietnameseFirst(client, 'xyzzy')
    expect(called('suggest')).toBe(true)
  })
})
