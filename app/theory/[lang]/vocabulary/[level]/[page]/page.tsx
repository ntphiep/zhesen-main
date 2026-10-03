/**
 * Page N of a level's word list, reached as `?page=N` through the rewrite in
 * `next.config.ts`. A search parameter read by the page itself would render it per
 * request; a path segment keeps every page in the route cache like page 1.
 */
export { default, generateMetadata } from '../page'

export function generateStaticParams(): { lang: string; level: string; page: string }[] {
  return []
}

// The parent's `revalidate`, written out: segment config must be a static literal.
export const revalidate = 604800
