// Fixed-window rate limiting for route handlers.
//
// The dictionary search route reaches Supabase on every query it has not cached,
// so a script issuing random queries bypasses the cache entirely and spends the
// project's database budget one request at a time. This caps how fast any single
// caller can do that.
//
// The counters live in this process's memory. That is deliberate: it needs no
// extra service, and the point is to blunt a flood, not to enforce an exact quota
// across a fleet. Several instances each allow the limit, so treat the configured
// number as a per-instance ceiling.

export interface RateLimitResult {
  allowed: boolean
  /** Requests left in the current window; 0 once the caller is over the limit. */
  remaining: number
  /** Seconds until the window resets. 0 while the caller is still under the limit. */
  retryAfterSeconds: number
}

export interface RateLimitOptions {
  /** Requests allowed per window, per key. */
  limit: number
  windowMs: number
  /**
   * Most distinct keys held at once. A flood from many spoofed addresses would
   * otherwise grow the map without bound, turning the defence into the leak.
   */
  maxKeys?: number
  /** Injectable clock, so tests do not have to wait out a real window. */
  now?: () => number
}

interface Window {
  count: number
  resetAt: number
}

export type RateLimiter = (key: string) => RateLimitResult

export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  const { limit, windowMs, maxKeys = 10_000, now = Date.now } = options
  if (limit < 1) throw new RangeError('limit phải từ 1 trở lên')
  if (windowMs < 1) throw new RangeError('windowMs phải lớn hơn 0')
  if (maxKeys < 1) throw new RangeError('maxKeys phải từ 1 trở lên')

  // Every window is the same length and each key is re-inserted when its window
  // renews, so the Map's insertion order is also its expiry order: the sweep can
  // stop at the first entry still alive.
  const windows = new Map<string, Window>()

  function dropExpired(at: number): void {
    for (const [key, window] of windows) {
      if (window.resetAt > at) break
      windows.delete(key)
    }
  }

  function dropOldestUntilRoom(): void {
    while (windows.size >= maxKeys) {
      const oldest = windows.keys().next()
      if (oldest.done) break
      windows.delete(oldest.value)
    }
  }

  return function check(key: string): RateLimitResult {
    const at = now()
    dropExpired(at)

    const current = windows.get(key)
    if (current && current.resetAt > at) {
      if (current.count >= limit) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - at) / 1000)),
        }
      }
      current.count += 1
      return { allowed: true, remaining: limit - current.count, retryAfterSeconds: 0 }
    }

    if (current) windows.delete(key)
    dropOldestUntilRoom()
    windows.set(key, { count: 1, resetAt: at + windowMs })
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 }
  }
}

/**
 * Whether the `x-forwarded-for` this request carries is the platform's word or
 * the caller's.
 *
 * Vercel rewrites the header at its edge and does not forward an external value:
 * "Vercel overwrites this header and does not forward external IPs to prevent
 * spoofing, unless a trusted proxy is enabled for Enterprise customers"
 * (https://vercel.com/docs/headers/request-headers). This project is not on
 * Enterprise, so on a Vercel deployment the header is trustworthy with no
 * configuration, and `VERCEL=1` is set on every such deployment
 * (https://vercel.com/docs/environment-variables/system-environment-variables).
 *
 * Detecting that matters because the alternative was one shared bucket: with no
 * per-address key, every visitor spends the same global budget, so a single
 * script could exhaust the assistant for the whole site at no cost to itself.
 *
 * `TRUST_PROXY_HEADER` stays for any other deployment behind a proxy that sets
 * the header. Anywhere else -- a bare `next start`, a container with the port
 * published straight out -- the header is whatever the caller typed, so it is
 * ignored.
 */
function forwardedForIsTrusted(): boolean {
  return process.env.TRUST_PROXY_HEADER === '1' || process.env.VERCEL === '1'
}

/**
 * Identify the caller, or nothing when the caller cannot be identified.
 *
 * A caller with no usable header must not be bucketed under one shared "unknown"
 * key, or every visitor on a bare `next start` caps the whole site's budget
 * together. Such a caller is not rate-limited by address at all; the database is
 * protected by `createColdQueryLimiter` below, which does not depend on knowing
 * who is asking.
 */
export function clientKey(request: Request): string | null {
  if (!forwardedForIsTrusted()) return null
  const forwarded = request.headers.get('x-forwarded-for')
  const first = forwarded?.split(',')[0]?.trim()
  if (first) return first
  return request.headers.get('x-real-ip')?.trim() || null
}

/**
 * Cap how many queries the cache has never seen get through per window.
 *
 * Per-address limiting can only work behind a trusted proxy, and the thing worth
 * protecting is not request count but database work: a query the server cache
 * already holds costs nothing to answer, and a query it has never seen costs a
 * round trip to Supabase. So the budget goes on the second kind. A caller cannot
 * escape it by forging a header, and a hundred people searching the same word
 * never spend more than the first one did.
 *
 * `remember` bounds the set of queries treated as already seen, and `rememberMs`
 * bounds how long one stays in it. Both matter. Without the second, a caller
 * could load the set with 5,000 distinct queries at the permitted rate, wait for
 * the server cache to expire underneath them, and then have all 5,000 counted as
 * warm while every one of them costs a round trip to Supabase. So `rememberMs`
 * has to be the caller's own cache lifetime, and the clock starts when the query
 * was first admitted rather than when it was last asked for -- that is when the
 * cache entry was written, and reading it does not make it younger.
 *
 * This memory is separate from, and smaller than, the server's own cache, and it
 * only decides whether a query costs budget; being wrong about one costs one
 * round trip, not correctness.
 */
export interface ColdQueryLimiterOptions {
  /** Queries not seen recently that may get through per window. */
  limit: number
  windowMs: number
  /** How many recent queries count as already seen. */
  remember?: number
  /** How long one stays counted as seen. Set it to the cache's own lifetime. */
  rememberMs?: number
  now?: () => number
}

export function createColdQueryLimiter(options: ColdQueryLimiterOptions): (query: string) => RateLimitResult {
  const { limit, windowMs, remember = 5_000, rememberMs = 3_600_000, now = Date.now } = options
  if (limit < 1) throw new RangeError('limit phải từ 1 trở lên')
  if (windowMs < 1) throw new RangeError('windowMs phải lớn hơn 0')
  if (remember < 1) throw new RangeError('remember phải từ 1 trở lên')
  if (rememberMs < 1) throw new RangeError('rememberMs phải lớn hơn 0')

  /** Query to the moment it was first admitted. Insertion order is the LRU order. */
  const seen = new Map<string, number>()
  let count = 0
  let resetAt = 0

  return function admit(query: string): RateLimitResult {
    const at = now()
    const firstSeenAt = seen.get(query)
    if (firstSeenAt !== undefined && at - firstSeenAt < rememberMs) {
      // Move to the end so the eviction below drops genuinely idle queries. The
      // timestamp rides along unchanged: it marks when the cache entry was
      // written, and asking for it again does not make that entry younger.
      seen.delete(query)
      seen.set(query, firstSeenAt)
      return { allowed: true, remaining: Math.max(0, limit - count), retryAfterSeconds: 0 }
    }
    if (firstSeenAt !== undefined) seen.delete(query)
    if (at >= resetAt) {
      count = 0
      resetAt = at + windowMs
    }
    if (count >= limit) {
      return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((resetAt - at) / 1000)) }
    }
    count += 1
    while (seen.size >= remember) {
      const oldest = seen.keys().next()
      if (oldest.done) break
      seen.delete(oldest.value)
    }
    seen.set(query, at)
    return { allowed: true, remaining: limit - count, retryAfterSeconds: 0 }
  }
}
