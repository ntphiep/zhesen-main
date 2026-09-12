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
 * Identify the caller for rate-limiting purposes.
 *
 * `x-forwarded-for` is only as trustworthy as the proxy in front of the app: a
 * hosting platform overwrites it, a bare Node server does not. Reading it here is
 * the right call behind a platform proxy and worth knowing about anywhere else,
 * because a caller who forges the header only splits their own budget.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const first = forwarded?.split(',')[0]?.trim()
  if (first) return first
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}
