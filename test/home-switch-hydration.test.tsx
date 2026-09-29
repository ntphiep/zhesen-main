import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { act } from '@testing-library/react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'

const m = vi.hoisted(() => ({ kind: null as 'permanent' | 'anonymous' | null, enabled: [] as boolean[] }))

vi.mock('@/lib/hooks/useAccount', () => ({ useAccount: () => ({ kind: m.kind, email: null }), signInHref: () => '/login' }))
vi.mock('@/lib/hooks/useHomeData', () => ({
  FORECAST_DAYS: 7,
  useHomeData: (enabled: boolean) => { m.enabled.push(enabled); return { view: null, status: 'idle', supabase: null, graded: vi.fn() } },
}))
vi.mock('@/lib/hooks/useGlobe', () => ({ useGlobe: () => ({ globe: null, world: null }) }))
vi.mock('@/components/home/fonts', () => ({ newsreader: { variable: '' }, patrickHand: { variable: '' } }))

import { HomeSwitch } from '@/components/home/HomeSwitch'
import { HOME_BOOT_SCRIPT, homeLayout } from '@/lib/home/homeLayout'
import { SUPABASE_AUTH_COOKIE } from '@/lib/supabase/env'

const page = <HomeSwitch landing={<p>landing page</p>} daily={null} />
const html = document.documentElement

let root: Root | null = null
let box: HTMLDivElement

// The layouts load through React.lazy: one render starts each import, and once they have
// resolved every later render is synchronous, as the server's is.
beforeAll(async () => {
  renderToString(page)
  await Promise.all([import('@/components/home/DeskLayout'), import('@/components/home/TodayLayout'), import('@/components/home/OrbitLayout')])
  await new Promise((r) => setTimeout(r))
})

beforeEach(() => {
  localStorage.clear()
  homeLayout.reset()
  m.kind = null
  m.enabled = []
  box = document.createElement('div')
  document.body.append(box)
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  box.remove()
  delete html.dataset.session
  delete html.dataset.homeLayout
  document.cookie = `${SUPABASE_AUTH_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
})

async function hydrate() {
  const errors: unknown[] = []
  const logged = vi.spyOn(console, 'error')
  await act(async () => {
    root = hydrateRoot(box, page, { onRecoverableError: (e) => errors.push(e) })
  })
  expect(errors).toEqual([])
  expect(logged).not.toHaveBeenCalled()
  logged.mockRestore()
}

const panels = () => [...box.querySelectorAll('[data-home-panel]')].map((p) => p.getAttribute('data-home-panel'))

describe('hydrating /', () => {
  it('serves every panel from the server, the landing page in full', () => {
    box.innerHTML = renderToString(page)
    expect(panels()).toEqual(['landing', 'desk', 'today', 'orbit'])
    expect(box.querySelector('[data-home-panel="landing"]')).toHaveTextContent('landing page')
    expect(box.querySelector('main')).toHaveAttribute('data-home-boot')
  })

  it('keeps only the stored layout for a reader, with its server DOM', async () => {
    box.innerHTML = renderToString(page)
    html.dataset.session = ''
    html.dataset.homeLayout = 'today'
    localStorage.setItem('zhesen:home-layout', 'today')
    const today = box.querySelector('[data-home-panel="today"]')
    await hydrate()
    expect(panels()).toEqual(['today'])
    expect(box.querySelector('[data-home-panel="today"]')).toBe(today)
    expect(box.querySelector('main')).not.toHaveAttribute('data-home-boot')
    // The mark is only the cookie's claim: nothing is read until the account is known.
    expect(m.enabled).not.toContain(true)
    m.kind = 'permanent'
    await act(async () => { root?.render(<HomeSwitch landing={<p>landing page</p>} daily={null} />) })
    expect(panels()).toEqual(['today'])
    expect(m.enabled).toContain(true)
  })

  it('keeps only the landing page for a visitor and reads no notebook', async () => {
    box.innerHTML = renderToString(page)
    const landing = box.querySelector('[data-home-panel="landing"]')
    await hydrate()
    expect(panels()).toEqual(['landing'])
    expect(box.querySelector('[data-home-panel="landing"]')).toBe(landing)
    expect(m.enabled).not.toContain(true)
  })

  it('never shows an anonymous session a frame of the home, before or after the account is known', async () => {
    const anonymous = { access_token: 'a', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u', email: '', is_anonymous: true } }
    document.cookie = `${SUPABASE_AUTH_COOKIE}=base64-${Buffer.from(JSON.stringify(anonymous)).toString('base64url')}; path=/`
    new Function(HOME_BOOT_SCRIPT)()
    // What app/globals.css reads before hydration: no data-session shows the landing alone.
    expect(html).not.toHaveAttribute('data-session')
    box.innerHTML = renderToString(page)
    await hydrate()
    expect(panels()).toEqual(['landing'])
    m.kind = 'anonymous'
    // A new element, so React renders again and the mocked hook is read afresh.
    await act(async () => { root?.render(<HomeSwitch landing={<p>landing page</p>} daily={null} />) })
    expect(panels()).toEqual(['landing'])
    expect(html).not.toHaveAttribute('data-session')
    expect(m.enabled).not.toContain(true)
  })
})
