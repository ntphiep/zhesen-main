import { describe, it, expect } from 'vitest'
import { clientKey, createRateLimiter } from '@/lib/http/rate-limit'

/** A limiter on a clock the test controls, so no test has to wait out a window. */
function limiterAt(limit: number, windowMs: number, maxKeys?: number) {
  let clock = 1_000
  const check = createRateLimiter({ limit, windowMs, maxKeys, now: () => clock })
  return { check, advance: (ms: number) => { clock += ms } }
}

describe('createRateLimiter', () => {
  it('allows up to the limit and refuses the next request', () => {
    const { check } = limiterAt(3, 60_000)
    expect([check('a'), check('a'), check('a')].map((r) => r.allowed)).toEqual([true, true, true])
    expect(check('a').allowed).toBe(false)
  })

  it('counts down the requests left in the window', () => {
    const { check } = limiterAt(3, 60_000)
    expect(check('a').remaining).toBe(2)
    expect(check('a').remaining).toBe(1)
    expect(check('a').remaining).toBe(0)
  })

  it('keeps one caller from spending another caller budget', () => {
    const { check } = limiterAt(2, 60_000)
    check('a'); check('a')
    expect(check('a').allowed).toBe(false)
    expect(check('b').allowed).toBe(true)
  })

  it('lets the caller back in once the window has passed', () => {
    const { check, advance } = limiterAt(1, 60_000)
    expect(check('a').allowed).toBe(true)
    expect(check('a').allowed).toBe(false)
    advance(60_000)
    expect(check('a').allowed).toBe(true)
  })

  it('reports at least a second to wait, never zero', () => {
    const { check, advance } = limiterAt(1, 60_000)
    check('a')
    expect(check('a').retryAfterSeconds).toBe(60)
    advance(59_900)
    // 100ms left rounds up rather than telling the caller to retry immediately.
    expect(check('a').retryAfterSeconds).toBe(1)
  })

  it('forgets old callers instead of growing without bound', () => {
    // A flood from forged addresses must not turn the defence into a memory leak.
    const { check } = limiterAt(1, 60_000, 4)
    for (let i = 0; i < 1_000; i++) check(`ip-${i}`)
    // The most recent caller is still tracked, so the cap did not disable the limit.
    expect(check('ip-999').allowed).toBe(false)
    // An evicted one starts over, which is the accepted cost of the cap.
    expect(check('ip-0').allowed).toBe(true)
  })

  it('sweeps expired windows so a quiet period leaves nothing behind', () => {
    const { check, advance } = limiterAt(1, 60_000, 3)
    check('a'); check('b'); check('c')
    advance(60_001)
    // With the expired three swept, three fresh callers fit under the same cap.
    expect([check('d'), check('e'), check('f')].every((r) => r.allowed)).toBe(true)
    expect(check('d').allowed).toBe(false)
  })

  it('refuses a configuration that would allow nothing or track nothing', () => {
    expect(() => createRateLimiter({ limit: 0, windowMs: 1_000 })).toThrow(RangeError)
    expect(() => createRateLimiter({ limit: 1, windowMs: 0 })).toThrow(RangeError)
    expect(() => createRateLimiter({ limit: 1, windowMs: 1_000, maxKeys: 0 })).toThrow(RangeError)
  })
})

describe('clientKey', () => {
  const req = (headers: Record<string, string>) => new Request('https://x.test/', { headers })

  it('takes the original client from a proxy chain', () => {
    expect(clientKey(req({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1, 10.0.0.2' }))).toBe('203.0.113.7')
  })

  it('trims the whitespace proxies leave around the addresses', () => {
    expect(clientKey(req({ 'x-forwarded-for': '  203.0.113.7 ' }))).toBe('203.0.113.7')
  })

  it('falls back to x-real-ip', () => {
    expect(clientKey(req({ 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9')
  })

  it('buckets callers it cannot identify together rather than exempting them', () => {
    expect(clientKey(req({}))).toBe('unknown')
    expect(clientKey(req({ 'x-forwarded-for': '   ' }))).toBe('unknown')
  })
})
