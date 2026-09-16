import type { MetadataRoute } from 'next'
import { LANG_CODES } from '@/lib/languages'
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
    '/grammar',
    '/practice',
    ...LANG_CODES.map((lang) => `/grammar/${lang}`),
    ...LANG_CODES.map((lang) => `/learn/${lang}`),
  ]
  return paths.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: 'weekly',
    priority: path === '/' ? 1 : 0.7,
  }))
}
