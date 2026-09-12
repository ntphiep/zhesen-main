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
 * Identify the caller, or nothing when the caller cannot be identified.
 *
 * `x-forwarded-for` is worth exactly as much as the proxy in front of the app: a
 * hosting platform overwrites whatever the client sent, a bare Node server passes
 * it straight through. So this reads the header only when `TRUST_PROXY_HEADER` says
 * a proxy is setting it, and returns null otherwise.
 *
 * Both halves of that were wrong before, in opposite directions. The header was
 * trusted unconditionally, so rotating it defeated the limit completely: measured
 * at 5,000 of 5,000 requests allowed. And a caller with no header at all was
 * bucketed under "unknown", so on a bare `next start` every visitor shared one
 * budget and 120 searches a minute capped the whole site: measured at 120 of 200.
 *
 * A caller that cannot be identified is not rate-limited by address at all. The
 * database is protected by `createColdQueryLimiter` below, which does not depend
 * on knowing who is asking.
 */
export function clientKey(request: Request): string | null {
  if (process.env.TRUST_PROXY_HEADER !== '1') return null
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
 * `remember` bounds the set of queries treated as already seen. It is a separate,
 * smaller memory than the server's own cache and only decides whether a query
 * costs budget; being wrong about one costs one round trip, not correctness.
 */
export interface ColdQueryLimiterOptions {
  /** Queries not seen recently that may get through per window. */
  limit: number
  windowMs: number
  /** How many recent queries count as already seen. */
  remember?: number
  now?: () => number
}

export function createColdQueryLimiter(options: ColdQueryLimiterOptions): (query: string) => RateLimitResult {
  const { limit, windowMs, remember = 5_000, now = Date.now } = options
  if (limit < 1) throw new RangeError('limit phải từ 1 trở lên')
  if (windowMs < 1) throw new RangeError('windowMs phải lớn hơn 0')
  if (remember < 1) throw new RangeError('remember phải từ 1 trở lên')

  const seen = new Set<string>()
  let count = 0
  let resetAt = 0

  return function admit(query: string): RateLimitResult {
    const at = now()
    if (seen.has(query)) {
      // Move to the end so the eviction below drops genuinely idle queries.
      seen.delete(query)
      seen.add(query)
      return { allowed: true, remaining: Math.max(0, limit - count), retryAfterSeconds: 0 }
    }
    if (at >= resetAt) {
      count = 0
      resetAt = at + windowMs
    }
    if (count >= limit) {
      return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((resetAt - at) / 1000)) }
    }
    count += 1
    while (seen.size >= remember) {
      const oldest = seen.values().next()
      if (oldest.done) break
      seen.delete(oldest.value)
    }
    seen.add(query)
    return { allowed: true, remaining: limit - count, retryAfterSeconds: 0 }
  }
}
