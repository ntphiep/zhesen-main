import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { HOME_BOOT_SCRIPT, hasSessionCookie, homeLayout, parseHomeLayout } from '@/lib/home/homeLayout'
import { SUPABASE_AUTH_COOKIE } from '@/lib/supabase/env'

const html = document.documentElement
const clearCookies = () => {
  for (const c of document.cookie.split(';')) {
    const name = c.split('=')[0].trim()
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  }
}
const boot = () => new Function(HOME_BOOT_SCRIPT)()

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
  it('is found whole or as its first chunk, and not under a longer name', () => {
    expect(hasSessionCookie(`a=1; ${SUPABASE_AUTH_COOKIE}=base64-x`)).toBe(true)
    expect(hasSessionCookie(`${SUPABASE_AUTH_COOKIE}.0=base64-x; ${SUPABASE_AUTH_COOKIE}.1=y`)).toBe(true)
    expect(hasSessionCookie(`x${SUPABASE_AUTH_COOKIE}=1`)).toBe(false)
    expect(hasSessionCookie('zhesen_theme=dark')).toBe(false)
  })
})

describe('HOME_BOOT_SCRIPT', () => {
  it('marks a session from the chunked cookie, with the stored layout', () => {
    document.cookie = `${SUPABASE_AUTH_COOKIE}.0=base64-abc; path=/`
    localStorage.setItem('zhesen:home-layout', 'today')
    boot()
    expect(html).toHaveAttribute('data-session')
    expect(html.dataset.homeLayout).toBe('today')
  })

  it('marks nothing without the cookie, and ignores a layout the page does not draw', () => {
    localStorage.setItem('zhesen:home-layout', 'columns')
    boot()
    expect(html).not.toHaveAttribute('data-session')
    expect(html).not.toHaveAttribute('data-home-layout')
  })

  it('leaves the default layout unmarked, so the CSS falls back to the desk', () => {
    document.cookie = `${SUPABASE_AUTH_COOKIE}=base64-abc; path=/`
    localStorage.setItem('zhesen:home-layout', 'desk')
    boot()
    expect(html).toHaveAttribute('data-session')
    expect(html).not.toHaveAttribute('data-home-layout')
  })
})
