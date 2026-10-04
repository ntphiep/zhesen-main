import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  permanentRedirect: (path: string) => { throw new Error(`NEXT_REDIRECT ${path}`) },
}))
vi.mock('@/lib/dictionary/cached', () => ({
  getCachedEntryDetail: vi.fn(async () => null),
  getCachedPhraseLemmaId: vi.fn(),
}))
vi.mock('@/lib/dictionary/wordPageData', () => ({ loadWordPage: vi.fn(async () => null) }))
vi.mock('@/components/lookup/LookupView', () => ({ LookupView: () => null }))

import Page from '@/app/dictionary/[lang]/[id]/page'
import { getCachedPhraseLemmaId } from '@/lib/dictionary/cached'
import { phraseLemmaId } from '@/lib/dictionary/resolveTokens'
import { loadWordPage } from '@/lib/dictionary/wordPageData'

function client(rows: unknown[]) {
  const rpc = vi.fn(async () => ({ data: rows, error: null }))
  return { c: { schema: vi.fn(() => ({ rpc })) } as unknown as SupabaseClient, rpc }
}

describe('phraseLemmaId', () => {
  it('names the phrase an inflected phrase is a form of', async () => {
    const { c, rpc } = client([{ form_text: 'gave up', entry_id: 'en:give up' }])
    expect(await phraseLemmaId(c, 'en', ' Gave up ')).toBe('en:give up')
    expect(rpc).toHaveBeenCalledWith('resolve_inflections', { p_lang: 'en', p_forms: ['gave up'] })
  })

  it('asks nothing for a single word, which has an entry of its own', async () => {
    const { c, rpc } = client([{ form_text: 'gave', entry_id: 'en:give' }])
    expect(await phraseLemmaId(c, 'en', 'gave')).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('never answers with the phrase itself', async () => {
    const { c } = client([{ form_text: 'give up', entry_id: 'en:give up' }])
    expect(await phraseLemmaId(c, 'en', 'give up')).toBeNull()
  })
})

describe('word page for an inflected phrase', () => {
  it('redirects to the phrase it is a form of', async () => {
    vi.mocked(getCachedPhraseLemmaId).mockResolvedValueOnce('en:give up')
    await expect(Page({ params: Promise.resolve({ lang: 'en', id: 'gave%20up' }) }))
      .rejects.toThrow('NEXT_REDIRECT /dictionary/en/give%20up')
    expect(getCachedPhraseLemmaId).toHaveBeenCalledWith('en', 'gave up')
  })

  // took off had a page of its own holding one Vietnamese gloss beside take off.
  it('redirects an entry with no English gloss to the phrase it is a form of', async () => {
    const tookOff = { detail: { id: 'en:took off', headword: 'took off', senses: [{ pos: null, glossVi: 'cất cánh', glossEn: null, senseOrder: 1 }] } }
    vi.mocked(loadWordPage).mockResolvedValueOnce(tookOff as unknown as Awaited<ReturnType<typeof loadWordPage>>)
    vi.mocked(getCachedPhraseLemmaId).mockResolvedValueOnce('en:take off')
    await expect(Page({ params: Promise.resolve({ lang: 'en', id: 'took%20off' }) }))
      .rejects.toThrow('NEXT_REDIRECT /dictionary/en/take%20off')
  })

  it('keeps a phrase with an English gloss on its own page', async () => {
    const fedUp = { detail: { id: 'en:fed up', headword: 'fed up', senses: [{ pos: 'adj', glossVi: 'chán ngấy', glossEn: 'Annoyed.', senseOrder: 1 }] } }
    vi.mocked(loadWordPage).mockResolvedValueOnce(fedUp as unknown as Awaited<ReturnType<typeof loadWordPage>>)
    vi.mocked(getCachedPhraseLemmaId).mockClear()
    await expect(Page({ params: Promise.resolve({ lang: 'en', id: 'fed%20up' }) })).resolves.toBeTruthy()
    expect(getCachedPhraseLemmaId).not.toHaveBeenCalled()
  })

  it('is not found when no phrase owns the form', async () => {
    vi.mocked(getCachedPhraseLemmaId).mockResolvedValueOnce(null)
    await expect(Page({ params: Promise.resolve({ lang: 'en', id: 'blue%20cat' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('does not look for a lemma behind a missing single word', async () => {
    vi.mocked(getCachedPhraseLemmaId).mockClear()
    await expect(Page({ params: Promise.resolve({ lang: 'en', id: 'nope' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(getCachedPhraseLemmaId).not.toHaveBeenCalled()
  })
})
