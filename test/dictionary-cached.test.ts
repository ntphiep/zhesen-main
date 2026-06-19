import { describe, it, expect, vi } from 'vitest'

const MOCK = { _mock: true }
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))
vi.mock('@/lib/supabase/content', () => ({ createContentClient: () => MOCK }))
vi.mock('@/lib/dictionary/search', () => ({
  getEntryDetail: vi.fn(async () => ({ id: 'en:dog' })),
  getCrossLanguage: vi.fn(async () => ([{ id: 'es:perro' }])),
  getCharacters: vi.fn(async () => ([{ char: '人' }])),
}))

import { getCachedEntryDetail, getCachedCrossLanguage, getCachedCharacters } from '@/lib/dictionary/cached'
import { getEntryDetail, getCrossLanguage, getCharacters } from '@/lib/dictionary/search'

describe('cached dictionary wrappers', () => {
  it('call the underlying fns with the content client', async () => {
    await getCachedEntryDetail('en:dog')
    expect(getEntryDetail).toHaveBeenCalledWith(MOCK, 'en:dog')
    await getCachedCrossLanguage('en:dog')
    expect(getCrossLanguage).toHaveBeenCalledWith(MOCK, 'en:dog')
    await getCachedCharacters('狗')
    expect(getCharacters).toHaveBeenCalledWith(MOCK, '狗')
  })
})
