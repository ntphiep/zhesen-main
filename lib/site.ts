import type { Metadata } from 'next'

/**
 * Written down because `VERCEL_PROJECT_PRODUCTION_URL` is absent from the build:
 * `vercel build --prod` reads only `.vercel/.env.production.local`, which carries `VERCEL`,
 * `VERCEL_ENV`, `VERCEL_TARGET_ENV` and `VERCEL_URL` but not that one. Falling through to
 * localhost put `http://localhost:3000` in sitemap.xml, robots.txt and every canonical.
 */
const PRODUCTION_ORIGIN = 'https://zhesen-main.vercel.app'

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.NODE_ENV === 'production'
      ? PRODUCTION_ORIGIN
      : 'http://localhost:3000')

/**
 * Title and description, for the head and the Open Graph card. Every page must go through
 * here rather than returning a bare `title`: Next inherits the layout's `openGraph` object
 * untouched, so a page setting only `title` is shared as the site's generic card. The
 * suffix is spelled out because `title.template` never reaches the Open Graph object.
 */
export function pageMetadata(
  { title, description, canonical }: { title: string; description: string; canonical?: string },
): Metadata {
  return {
    title,
    description,
    openGraph: { title: `${title} · Zhesen`, description, ...(canonical ? { url: canonical } : {}) },
    ...(canonical ? { alternates: { canonical } } : {}),
  }
}
