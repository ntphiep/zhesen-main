/**
 * The one place deciding where an emailed link or a `?next=` parameter may send the
 * browser. The callback route, login and register pages all apply this same rule: a second
 * implementation of a redirect guard is how one of them stops being checked.
 */

/** Where an auth link or sign-in form lands when it carries no usable destination. */
export const AUTH_FALLBACK = '/wordlist'

/**
 * `next` arrives in a URL anyone can hand the user, so it must be confined to this site.
 * Resolve with the SAME parser that performs the redirect and compare origins, never a
 * prefix list: WHATWG URL reads a backslash as a slash. The origin check alone is not
 * enough, because the caller parses the result again -- `/..//evil.com` passes it and then
 * resolves protocol-relative -- so a pathname starting with two slashes is refused.
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
  if (resolved.pathname.startsWith('//')) return AUTH_FALLBACK
  return resolved.pathname + resolved.search
}
