import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { HOME_BOOT_SCRIPT, homeLayout, parseHomeLayout } from '@/lib/home/homeLayout'
import { SUPABASE_AUTH_COOKIE } from '@/lib/supabase/env'

const html = document.documentElement
const clearCookies = () => {
  for (const c of document.cookie.split(';')) {
    const name = c.split('=')[0].trim()
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  }
}
const boot = () => new Function(HOME_BOOT_SCRIPT)()

const HOUR = 3600
const nowSec = () => Math.floor(Date.now() / 1000)
/** What @supabase/ssr 0.12 writes: auth-js's session JSON as `base64-` plus base64url. */
const session = (user: { email: string; is_anonymous: boolean }, expiresAt = nowSec() + HOUR) =>
  `base64-${Buffer.from(JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_at: expiresAt, user: { id: 'u', ...user } })).toString('base64url')}`
const PERMANENT = session({ email: 'a@b.com', is_anonymous: false })
const ANONYMOUS = session({ email: '', is_anonymous: true })

beforeEach(() => {
  localStorage.clear()
  clearCookies()
  homeLayout.reset()
  delete html.dataset.session
  delete html.dataset.homeLayout
})
afterEach(clearCookies)

describe('the home layout choice', () => {
  it('reads anything it does not draw as the desk', () => {
    expect(parseHomeLayout(null)).toBe('desk')
    expect(parseHomeLayout('columns')).toBe('desk')
    expect(parseHomeLayout('today')).toBe('today')
  })

  it('remembers a pick in storage and on <html>', () => {
    homeLayout.set('orbit')
    expect(localStorage.getItem('zhesen:home-layout')).toBe('orbit')
    expect(html.dataset.homeLayout).toBe('orbit')
    homeLayout.reset()
    expect(homeLayout.snapshot()).toBe('orbit')
  })
})

describe('the session cookie', () => {
  it('is read whole, and not under a longer name', () => {
    document.cookie = `x${SUPABASE_AUTH_COOKIE}=${PERMANENT}; path=/`
    boot()
    expect(html).not.toHaveAttribute('data-session')
    document.cookie = `${SUPABASE_AUTH_COOKIE}=${PERMANENT}; path=/`
    boot()
    expect(html).toHaveAttribute('data-session')
  })
})

describe('HOME_BOOT_SCRIPT', () => {
  it('marks a session from the chunked cookie, with the stored layout', () => {
    const half = Math.ceil(PERMANENT.length / 2)
    document.cookie = `${SUPABASE_AUTH_COOKIE}.0=${PERMANENT.slice(0, half)}; path=/`
    document.cookie = `${SUPABASE_AUTH_COOKIE}.1=${PERMANENT.slice(half)}; path=/`
    localStorage.setItem('zhesen:home-layout', 'today')
    boot()
    expect(html).toHaveAttribute('data-session')
    expect(html.dataset.homeLayout).toBe('today')
  })

  it('never marks an anonymous account, whose home is the landing page', () => {
    document.cookie = `${SUPABASE_AUTH_COOKIE}=${ANONYMOUS}; path=/`
    boot()
    expect(html).not.toHaveAttribute('data-session')
  })

  it('never marks an expired session, which may not come back', () => {
    document.cookie = `${SUPABASE_AUTH_COOKIE}=${session({ email: 'a@b.com', is_anonymous: false }, nowSec() - 1)}; path=/`
    boot()
    expect(html).not.toHaveAttribute('data-session')
  })

  it('reads a cookie it cannot decode as no session, and still sets the layout', () => {
    document.cookie = `${SUPABASE_AUTH_COOKIE}.0=base64-abc; path=/`
    localStorage.setItem('zhesen:home-layout', 'today')
    boot()
    expect(html).not.toHaveAttribute('data-session')
    expect(html.dataset.homeLayout).toBe('today')
  })

  it('marks nothing without the cookie, and ignores a layout the page does not draw', () => {
    localStorage.setItem('zhesen:home-layout', 'columns')
    boot()
    expect(html).not.toHaveAttribute('data-session')
    expect(html).not.toHaveAttribute('data-home-layout')
  })

  it('leaves the default layout unmarked, so the CSS falls back to the desk', () => {
    document.cookie = `${SUPABASE_AUTH_COOKIE}=${PERMANENT}; path=/`
    localStorage.setItem('zhesen:home-layout', 'desk')
    boot()
    expect(html).toHaveAttribute('data-session')
    expect(html).not.toHaveAttribute('data-home-layout')
  })
})
