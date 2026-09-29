import { describe, it, expect, vi } from 'vitest'
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
// Signed in, so the footer draws its /account link too.
vi.mock('@/lib/hooks/useAccount', () => ({ useAccount: () => ({ kind: 'permanent', email: 'a@b.com' }) }))

import Home from '@/app/page'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { SiteFooter } from '@/components/layout/SiteFooter'

describe('home page with the header', () => {
  it('prefetches each URL from one link at most, and never a route that reads the session', async () => {
    render(<><SiteHeader />{await Home()}<SiteFooter /></>)
    const prefetched = screen.getAllByRole('link')
      .filter((a) => a.dataset.prefetch === 'on')
      .map((a) => a.getAttribute('href'))
    expect(prefetched.length).toBe(new Set(prefetched).size)
    expect(prefetched).not.toContain('/practice')
    expect(prefetched).not.toContain('/wordlist')
  })

  it('never prefetches from the footer, where the session routes are linked', () => {
    render(<SiteFooter />)
    const links = screen.getAllByRole('link')
    const hrefs = links.map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(expect.arrayContaining(['/practice', '/wordlist', '/account']))
    expect(links.filter((a) => a.dataset.prefetch === 'on')).toEqual([])
  })
})
