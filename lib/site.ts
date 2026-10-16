import type { Metadata } from 'next'

/**
 * Written down because `VERCEL_PROJECT_PRODUCTION_URL` is absent from the build:
 * `vercel build --prod` reads only `.vercel/.env.production.local`, which carries `VERCEL`,
 * `VERCEL_ENV`, `VERCEL_TARGET_ENV` and `VERCEL_URL` but not that one. Falling through to
 * localhost put `http://localhost:3000` in sitemap.xml, robots.txt and every canonical.
 */
const PRODUCTION_ORIGIN = 'https://zhesen.net'

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.NODE_ENV === 'production'
      ? PRODUCTION_ORIGIN
      : 'http://localhost:3000')

export const SITE_DESCRIPTION = 'Tra từ tiếng Anh, Trung, Tây Ban Nha với tiếng Việt rồi lưu vào sổ tay để ôn.'
export const SITE_CARD_ALT = 'Zhesen: từ điển Trung, Tây Ban Nha, Anh'

/**
 * The site-level Open Graph and Twitter fields. Next merges metadata shallowly, so a page that
 * sets `openGraph` replaces the layout's whole object and loses these unless it spreads them in.
 */
export const SITE_SOCIAL = {
  // Named here as well as in app/opengraph-image.tsx: a page that sets its own `openGraph`
  // otherwise loses the root card (measured on /theory). A segment's own card file still wins.
  openGraph: {
    type: 'website', siteName: 'Zhesen', locale: 'vi_VN',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: SITE_CARD_ALT }],
  },
  // Every page has a wide card: app/opengraph-image.tsx, or the word page's own.
  twitter: { card: 'summary_large_image' },
} satisfies Pick<Metadata, 'openGraph' | 'twitter'>

/**
 * Title and description, for the head and the Open Graph card. Every page must go through
 * here rather than returning a bare `title`: Next inherits the layout's `openGraph` object
 * untouched, so a page setting only `title` is shared as the site's generic card. The
 * suffix is spelled out because `title.template` never reaches the Open Graph object.
 * `noindex` keeps the page out of search results while its links are still followed.
 */
export function pageMetadata(
  { title, description, canonical, noindex }:
    { title: string; description: string; canonical?: string; noindex?: boolean },
): Metadata {
  return {
    title,
    description,
    openGraph: {
      ...SITE_SOCIAL.openGraph,
      title: `${title} · Zhesen`,
      description,
      ...(canonical ? { url: canonical } : {}),
    },
    twitter: SITE_SOCIAL.twitter,
    ...(canonical ? { alternates: { canonical } } : {}),
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  }
}
