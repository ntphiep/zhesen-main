'use client'
import { useLinkStatus } from 'next/link'

/**
 * A dot next to a link while the page behind it is still fetching.
 *
 * Every link this sits inside is `prefetch={false}` because those routes read the
 * session, so the click has nothing behind it yet: 254 ms warm and 1,239 ms on a
 * cold function, measured against production.
 *
 * A route-level `loading.tsx` is not a substitute: its Suspense boundary streams
 * the status line before the render reaches `notFound()` or `redirect()`, so a
 * missing entry answers 200 instead of 404 and /practice answers 200 instead of
 * 307 to /login. Every dynamic route here ends in one of those two calls.
 *
 * `useLinkStatus` must be rendered inside the `Link` it reports on
 * (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-link-status.md).
 */
export function LinkPending() {
  const { pending } = useLinkStatus()
  return <span aria-hidden className={`link-pending${pending ? ' is-pending' : ''}`} />
}
