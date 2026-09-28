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
vi.mock('@/lib/dictionary/cached', () => ({ getCachedWordOfDay: vi.fn(async () => null) }))

import Home from '@/app/page'
import { SiteHeader } from '@/components/layout/SiteHeader'

describe('home page with the header', () => {
  it('prefetches each URL from one link at most, and never a route that reads the session', async () => {
    render(<><SiteHeader />{await Home()}</>)
    const prefetched = screen.getAllByRole('link')
      .filter((a) => a.dataset.prefetch === 'on')
      .map((a) => a.getAttribute('href'))
    expect(prefetched.length).toBe(new Set(prefetched).size)
    expect(prefetched).not.toContain('/practice')
    expect(prefetched).not.toContain('/wordlist')
  })
})
