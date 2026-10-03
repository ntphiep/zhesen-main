import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))
vi.mock('@/lib/dictionary/cached', () => ({
  getCachedLevelsForLanguage: vi.fn(),
  getCachedEntriesByLevel: vi.fn(),
}))
vi.mock('@/components/vocabulary/LevelWordList', () => ({
  LevelWordList: ({ level }: { level: string }) => <div>level:{level}</div>,
}))

import Page, { generateMetadata } from '@/app/theory/[lang]/vocabulary/[level]/page'
import { getCachedEntriesByLevel, getCachedLevelsForLanguage } from '@/lib/dictionary/cached'

const params = (lang: string, level: string) => ({ params: Promise.resolve({ lang, level }) })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCachedEntriesByLevel).mockResolvedValue({ items: [], total: 2302 })
  vi.mocked(getCachedLevelsForLanguage).mockResolvedValue([{ level: 'A1', count: 2302, levelIsEstimated: false }])
})

// A 404 rendered here is stored for the page's whole revalidate window, so it may
// only come from facts that cannot change on a cold start.
describe('vocabulary level page', () => {
  it('renders a level the list carries', async () => {
    await expect(Page(params('en', 'A1'))).resolves.toBeTruthy()
  })

  it('answers 404 for a level outside the fixed set without reading the database', async () => {
    for (const level of ['zzz', 'a1', 'HSK1']) {
      await expect(Page(params('en', level))).rejects.toThrow('NEXT_NOT_FOUND')
    }
    expect(getCachedLevelsForLanguage).not.toHaveBeenCalled()
    expect(getCachedEntriesByLevel).not.toHaveBeenCalled()
  })

  it('throws rather than answering 404 when the level list lacks a level that has words', async () => {
    vi.mocked(getCachedLevelsForLanguage).mockResolvedValueOnce([{ level: 'A2', count: 1200, levelIsEstimated: false }])
    const rendered = Page(params('en', 'A1'))
    await expect(rendered).rejects.toThrow()
    await expect(rendered).rejects.not.toThrow('NEXT_NOT_FOUND')
  })

  it('answers 404 for a level in the fixed set that holds no words', async () => {
    vi.mocked(getCachedLevelsForLanguage).mockResolvedValueOnce([{ level: 'C1', count: 3800, levelIsEstimated: true }])
    vi.mocked(getCachedEntriesByLevel).mockResolvedValueOnce({ items: [], total: 0 })
    await expect(Page(params('es', 'C2'))).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

// `?page=N` reaches the page as a `page` param through the rewrite in next.config.ts.
describe('vocabulary level page N', () => {
  const paged = (page: string) => ({ params: Promise.resolve({ lang: 'en', level: 'A1', page }) })

  it('reads the rows of page N', async () => {
    await expect(Page(paged('3'))).resolves.toBeTruthy()
    expect(getCachedEntriesByLevel).toHaveBeenCalledWith('en', 'A1', 80, 40)
  })

  it('answers 404 past the last page without reading rows the database would refuse', async () => {
    await expect(Page(paged('59'))).rejects.toThrow('NEXT_NOT_FOUND')
    expect(getCachedEntriesByLevel).not.toHaveBeenCalled()
  })

  it('answers 404 for a page number that is not a positive integer', async () => {
    for (const page of ['0', '01', '1e1', 'x']) {
      await expect(Page(paged(page))).rejects.toThrow('NEXT_NOT_FOUND')
    }
  })

  it('gives each page its own canonical, and page 1 the level itself', async () => {
    expect((await generateMetadata(paged('2'))).alternates?.canonical).toBe('/theory/en/vocabulary/A1?page=2')
    expect((await generateMetadata(paged('1'))).alternates?.canonical).toBe('/theory/en/vocabulary/A1')
    expect((await generateMetadata(params('en', 'A1'))).alternates?.canonical).toBe('/theory/en/vocabulary/A1')
  })
})
