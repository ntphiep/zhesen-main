import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const rpc = vi.fn()
vi.mock('@/lib/supabase/content', () => ({ createContentClient: () => ({ schema: () => ({ rpc }) }) }))

import { dictionarySitemapPath, getSitemapCount, getSitemapPage, sitemapIds } from '@/lib/dictionary/sitemap'
import sitemap, { generateSitemaps } from '@/app/dictionary/sitemap'
import hubSitemap from '@/app/sitemap'
import robots from '@/app/robots'
import { SITE_URL } from '@/lib/site'

const client = { schema: () => ({ rpc }) } as unknown as SupabaseClient

beforeEach(() => rpc.mockReset())

describe('dictionary sitemap paging', () => {
  it('splits the entries into sitemaps of 20,000', () => {
    expect(sitemapIds(0)).toEqual([])
    expect(sitemapIds(20000)).toEqual([{ id: 0 }])
    expect(sitemapIds(20001)).toEqual([{ id: 0 }, { id: 1 }])
    expect(sitemapIds(166307).map((s) => s.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('asks for one page of 20,000 ids', async () => {
    rpc.mockResolvedValueOnce({ data: ['en:take', 'zh:学习'], error: null })
    expect(await getSitemapPage(client, 3)).toEqual(['en:take', 'zh:学习'])
    expect(rpc).toHaveBeenCalledWith('sitemap_page', { p_page: 3, p_size: 20000 })
  })

  // postgrest-js answers an empty body with `data: null, error: null`: no sitemaps at all
  // would be published for a day.
  it('throws on a count that is not a number', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null })
    await expect(getSitemapCount(client)).rejects.toThrow()
  })

  it('lists one URL per entry, with no lastModified', async () => {
    rpc.mockResolvedValueOnce({ data: 166307, error: null })
    expect(await generateSitemaps()).toHaveLength(9)
    rpc.mockResolvedValueOnce({ data: ['en:take', 'zh:学习'], error: null })
    expect(await sitemap({ id: Promise.resolve('8') })).toEqual([
      { url: `${SITE_URL}/dictionary/en/take` },
      { url: `${SITE_URL}/dictionary/zh/%E5%AD%A6%E4%B9%A0` },
    ])
    expect(rpc).toHaveBeenLastCalledWith('sitemap_page', { p_page: 8, p_size: 20000 })
  })

  it('names every dictionary sitemap in robots.txt beside the hub sitemap', async () => {
    rpc.mockResolvedValueOnce({ data: 40001, error: null })
    expect((await robots()).sitemap).toEqual([
      `${SITE_URL}/sitemap.xml`,
      `${SITE_URL}${dictionarySitemapPath(0)}`,
      `${SITE_URL}${dictionarySitemapPath(1)}`,
      `${SITE_URL}${dictionarySitemapPath(2)}`,
    ])
    expect(dictionarySitemapPath(2)).toBe('/dictionary/sitemap/2.xml')
  })
})

describe('hub sitemap', () => {
  // /practice sends a guest to /login.
  it('leaves out pages a crawler cannot open', () => {
    const urls = hubSitemap().map((e) => e.url)
    expect(urls).toContain(`${SITE_URL}/dictionary`)
    expect(urls).not.toContain(`${SITE_URL}/practice`)
  })

  it('lists each TOEIC part and topic page once', () => {
    const toeic = hubSitemap().map((e) => e.url).filter((u) => /\/toeic\/(part|topic)\//.test(u))
    expect(toeic).toHaveLength(19)
    expect(new Set(toeic).size).toBe(19)
    expect(toeic).toContain(`${SITE_URL}/theory/en/toeic/part/5`)
    expect(toeic).toContain(`${SITE_URL}/theory/en/toeic/topic/office`)
  })
})
