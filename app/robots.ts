import type { MetadataRoute } from 'next'
import { createContentClient } from '@/lib/supabase/content'
import { dictionarySitemapPath, getSitemapCount, sitemapIds } from '@/lib/dictionary/sitemap'
import { SITE_URL } from '@/lib/site'

// One day, the dictionary sitemaps' window: the number of them follows the entry count.
export const revalidate = 86400

/**
 * Everything behind an account is disallowed: those pages render one person's
 * notebook and have nothing a search result could offer anyone else. The
 * dictionary and grammar trees stay open, which is the whole point of the site.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const dictionary = sitemapIds(await getSitemapCount(createContentClient()))
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/account', '/wordlist', '/login', '/register', '/auth/', '/admin'],
    },
    sitemap: [`${SITE_URL}/sitemap.xml`, ...dictionary.map(({ id }) => `${SITE_URL}${dictionarySitemapPath(id)}`)],
  }
}
