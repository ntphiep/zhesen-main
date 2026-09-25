import type { MetadataRoute } from 'next'
import { LANG_CODES } from '@/lib/languages'
import { BLOCKS_BY_LANG } from '@/lib/theory/blocks'
import { theoryBlockPath, theoryLangPath } from '@/lib/theory/path'
import { SITE_URL } from '@/lib/site'

/**
 * The hub pages only. Entry and grammar detail pages number in the tens of
 * thousands and are reached from these hubs; listing them here would mean
 * generating and serving a sitemap index off the database on every crawl, which
 * buys nothing while the catalogue is this stable.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    '/',
    '/dictionary',
    '/theory',
    '/practice',
    ...LANG_CODES.map((lang) => theoryLangPath(lang)),
    ...LANG_CODES.flatMap((lang) => BLOCKS_BY_LANG[lang].map((b) => theoryBlockPath(lang, b.key))),
  ]
  return paths.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: 'weekly',
    priority: path === '/' ? 1 : 0.7,
  }))
}
