'use client'
import { useLinkStatus } from 'next/link'

/**
 * A dot that appears next to a link while the page behind it is still being
 * fetched, so a click that takes a moment does not look ignored.
 *
 * Every link this sits inside is `prefetch={false}`, and that is the case the
 * hook exists for: those routes read the session, so prefetching them made each
 * page load query Supabase four times over for a reader who might open none of
 * them. What is left is a click with nothing behind it yet -- measured against
 * production, 254 ms warm and 1,239 ms on a cold function, with the old page
 * sitting still for all of it.
 *
 * A route-level `loading.tsx` is the other way to answer the click and it was
 * tried and taken back out: a Suspense boundary on the route makes the response
 * stream, and the status line is sent before the render reaches `notFound()` or
 * `redirect()`. Measured on a local production build with one at the root, a
 * missing entry answered 200 with the site's generic title instead of 404, and
 * /practice answered 200 with a skeleton instead of 307 to /login. Both matter
 * to a crawler, and every dynamic route in this app ends in one of those two
 * calls, so there is no segment where the file would have been safe.
 *
 * `useLinkStatus` must be rendered inside the `Link` it reports on
 * (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-link-status.md).
 * The dot holds its space from the first paint and only fades in, after a delay,
 * so a fast navigation shows nothing and nothing on the line moves.
 */
export function LinkPending() {
  const { pending } = useLinkStatus()
  return <span aria-hidden className={`link-pending${pending ? ' is-pending' : ''}`} />
}
