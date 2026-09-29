import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

// Link's `prefetch` never reaches the DOM, so the stub writes it where a test can read it.
vi.mock('next/link', () => ({
  default: ({ href, prefetch, children }: { href: string; prefetch?: boolean | null; children: ReactNode }) =>
    <a href={href} data-prefetch={prefetch === false ? 'off' : 'on'}>{children}</a>,
  useLinkStatus: () => ({ pending: false }),
}))
vi.mock('next/navigation', () => ({ usePathname: () => '/' }))
vi.mock('@/components/account/AccountLink', () => ({ AccountLink: () => null }))
vi.mock('@/components/search/LookupPair', () => ({ LookupPair: () => null }))
vi.mock('@/lib/dictionary/cached', () => ({
  getCachedWordOfDay: vi.fn(async () => null),
  getCachedSearch: vi.fn(async () => ({ entries: { en: [], es: [], zh: [] } })),
  getCachedEntryDetail: vi.fn(async () => null),
}))
vi.mock('@/lib/dictionary/learnerCached', () => ({ getCachedLearnerLayer: vi.fn(async () => null) }))
// next/font only works under the Next compiler, and jsdom has no canvas for the globe.
vi.mock('@/components/home/fonts', () => ({ newsreader: { variable: '' }, patrickHand: { variable: '' } }))
vi.mock('@/lib/hooks/useGlobe', () => ({ useGlobe: () => ({ globe: null, world: null }) }))
const account = vi.hoisted(() => ({ kind: 'permanent' as 'permanent' | 'none' }))
// Signed in by default, so the footer draws its /account link too.
vi.mock('@/lib/hooks/useAccount', () => ({
  useAccount: () => ({ kind: account.kind, email: account.kind === 'permanent' ? 'a@b.com' : null }),
  signInHref: () => '/login',
}))

import Home from '@/app/page'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { SiteFooter } from '@/components/layout/SiteFooter'

function prefetched(): (string | null)[] {
  return screen.getAllByRole('link')
    .filter((a) => a.dataset.prefetch === 'on')
    .map((a) => a.getAttribute('href'))
}

beforeEach(() => { account.kind = 'permanent' })

describe('home page with the header', () => {
  it('prefetches each URL from one link at most, and never a route that reads the session', async () => {
    const { container } = render(<><SiteHeader />{await Home()}<SiteFooter /></>)
    // The desk loads lazily; wait for it, so its links are counted.
    await screen.findByText('Các từ sẽ ra trong phiên ôn')
    expect(container.querySelector('[data-home-panel]')).toHaveAttribute('data-home-panel', 'desk')
    const urls = prefetched()
    expect(urls.length).toBe(new Set(urls).size)
    expect(urls).not.toContain('/practice')
    expect(urls).not.toContain('/wordlist')
  })

  it('holds the landing page, which every visitor sees, to the same rule', async () => {
    account.kind = 'none'
    const { container } = render(<><SiteHeader />{await Home()}<SiteFooter /></>)
    expect(container.querySelector('[data-home-panel]')).toHaveAttribute('data-home-panel', 'landing')
    const urls = prefetched()
    expect(urls.length).toBe(new Set(urls).size)
    expect(urls).not.toContain('/practice')
    expect(urls).not.toContain('/wordlist')
  })

  it('never prefetches from the footer, where the session routes are linked', () => {
    render(<SiteFooter />)
    const links = screen.getAllByRole('link')
    const hrefs = links.map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(expect.arrayContaining(['/practice', '/wordlist', '/account']))
    expect(links.filter((a) => a.dataset.prefetch === 'on')).toEqual([])
  })
})
