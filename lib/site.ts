import type { Metadata } from 'next'

/**
 * The origin the deployment is reachable at, for canonical URLs, the sitemap and
 * robots.txt.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` would be the right answer and is checked
 * first, but it is not available where this value is decided. The deploy builds
 * on GitHub Actions (`.github/workflows/ci.yml`): `vercel pull` writes
 * `.vercel/.env.production.local`, `vercel build --prod` reads only that file,
 * and that file carries `VERCEL`, `VERCEL_ENV`, `VERCEL_TARGET_ENV` and
 * `VERCEL_URL` but no `VERCEL_PROJECT_PRODUCTION_URL`. Falling through to
 * localhost put `http://localhost:3000` into sitemap.xml, into the Sitemap line
 * of robots.txt, and into the canonical and og:url of every prerendered page.
 *
 * So the domain is written down. `NEXT_PUBLIC_SITE_URL` overrides it without a
 * code change if the project ever moves, and development still gets localhost.
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
 * Title and description, in the document head and in the Open Graph card.
 *
 * The root layout declares a full `openGraph` object. Next replaces that object
 * wholesale when a child declares its own and inherits it untouched otherwise,
 * so a page that sets only `title` is still shared as the site's generic card.
 * Every page therefore goes through here rather than returning a bare `title`.
 *
 * The suffix is spelled out here because `title.template` applies to the head
 * title only and never reaches the Open Graph object.
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
