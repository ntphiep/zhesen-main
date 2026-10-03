import type { MetadataRoute } from 'next'
import { LANG_CODES } from '@/lib/languages'
import { BLOCKS_BY_LANG } from '@/lib/theory/blocks'
import { theoryBlockPath, theoryLangPath } from '@/lib/theory/path'
import { SITE_URL } from '@/lib/site'

/**
 * The hub pages. Dictionary entries have their own sitemaps (app/dictionary/sitemap.ts),
 * which robots.txt lists beside this one. `/practice` is left out: it sends a guest to
 * `/login`.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    '/',
    '/dictionary',
    '/theory',
    ...LANG_CODES.map((lang) => theoryLangPath(lang)),
    ...LANG_CODES.flatMap((lang) => BLOCKS_BY_LANG[lang].map((b) => theoryBlockPath(lang, b.key))),
  ]
  return paths.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: 'weekly',
    priority: path === '/' ? 1 : 0.7,
  }))
}
