// Fixed-window rate limiting for route handlers, counting in this process's memory.
// KNOWN CEILING: several instances each allow the full limit, so the configured number
// is a per-instance ceiling, not a fleet-wide quota. Upgrade path is a shared store.

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
  /** Most distinct keys held at once. Unbounded, a flood from spoofed addresses grows
   *  the map without limit, turning the defence into the leak. */
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
  if (limit < 1) throw new RangeError('limit must be at least 1')
  if (windowMs < 1) throw new RangeError('windowMs must be greater than 0')
  if (maxKeys < 1) throw new RangeError('maxKeys must be at least 1')

  // Windows are all one length and a key is re-inserted when its window renews, so
  // insertion order is expiry order: the sweep stops at the first entry still alive.
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
 * Whether `x-forwarded-for` is the platform's word or the caller's. Vercel overwrites it
 * at the edge (except for Enterprise trusted proxies, which this project is not) and sets
 * `VERCEL=1`; on any other host only `TRUST_PROXY_HEADER=1` makes it trustworthy.
 * https://vercel.com/docs/headers/request-headers
 * https://vercel.com/docs/environment-variables/system-environment-variables
 */
function forwardedForIsTrusted(): boolean {
  return process.env.TRUST_PROXY_HEADER === '1' || process.env.VERCEL === '1'
}

/** Identify the caller, or null when it cannot be identified. An unidentified caller must
 *  never be bucketed under a shared "unknown" key, or every visitor caps the site's budget
 *  together; `createColdQueryLimiter` protects the database without knowing who is asking. */
export function clientKey(request: Request): string | null {
  if (!forwardedForIsTrusted()) return null
  const forwarded = request.headers.get('x-forwarded-for')
  const first = forwarded?.split(',')[0]?.trim()
  if (first) return first
  return request.headers.get('x-real-ip')?.trim() || null
}

/**
 * Cap how many queries the server cache has never seen get through per window: the budget
 * goes on database work rather than request count, so forging a header does not escape it.
 * `rememberMs` must be that cache's own lifetime, or a caller loads `remember` distinct
 * queries, waits for the cache to expire underneath them, and has them all counted warm.
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
  if (limit < 1) throw new RangeError('limit must be at least 1')
  if (windowMs < 1) throw new RangeError('windowMs must be greater than 0')
  if (remember < 1) throw new RangeError('remember must be at least 1')
  if (rememberMs < 1) throw new RangeError('rememberMs must be greater than 0')

  /** Query to the moment it was first admitted. Insertion order is the LRU order. */
  const seen = new Map<string, number>()
  let count = 0
  let resetAt = 0

  return function admit(query: string): RateLimitResult {
    const at = now()
    const firstSeenAt = seen.get(query)
    if (firstSeenAt !== undefined && at - firstSeenAt < rememberMs) {
      // Move to the end so eviction drops genuinely idle queries. The timestamp rides
      // along unchanged: it marks when the cache entry was written, not when it was read.
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
