import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

/**
 * Everything behind an account is disallowed: those pages render one person's
 * notebook and have nothing a search result could offer anyone else. The
 * dictionary and grammar trees stay open, which is the whole point of the site.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/account', '/wordlist', '/login', '/register', '/auth/', '/admin'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
