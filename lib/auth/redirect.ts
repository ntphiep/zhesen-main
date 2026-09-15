/**
 * The one place that decides where an emailed link or a `?next=` parameter may
 * send the browser. Lives here rather than in the callback route because the
 * login and register pages apply the same rule to a query anyone can hand the
 * user, and two implementations of one redirect guard is how one of them stops
 * being checked.
 */

/** Where an auth link or sign-in form lands when it carries no usable
 *  destination: the notebook, which is what an account exists for. */
export const AUTH_FALLBACK = '/wordlist'

/**
 * `next` arrives in a URL anyone can hand the user, so it is confined to this
 * site. The check resolves it with the SAME parser that will perform the
 * redirect and then compares origins, rather than rejecting a list of prefixes:
 * a first attempt rejected `//evil.test` and let `/\evil.test` through, because
 * WHATWG URL reads a backslash as a slash in an http(s) URL. Measured:
 * `new URL('/\evil.test/x', 'https://zhesen.app').origin` is `https://evil.test`.
 * Only the parser knows what it will do with exotic input, so ask it.
 */
export function safeNext(raw: string | null, origin: string): string {
  if (!raw) return AUTH_FALLBACK
  let resolved: URL
  try {
    resolved = new URL(raw, origin)
  } catch {
    return AUTH_FALLBACK
  }
  if (resolved.origin !== new URL(origin).origin) return AUTH_FALLBACK
  return resolved.pathname + resolved.search
}
