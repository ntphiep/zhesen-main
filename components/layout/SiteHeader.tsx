'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AccountLink } from '@/components/account/AccountLink'
import { LinkPending } from '@/components/ui/LinkPending'

/**
 * `prefetch` is off for the two routes that read the session. A Link prefetches as
 * soon as it enters the viewport and this header is on every page, so otherwise each
 * page load also fetches /practice and /wordlist, two renders that query Supabase.
 * The dictionary and theory routes stay on: the edge cache answers them.
 */
const NAV = [
  { href: '/dictionary', label: 'Dịch', prefetch: true },
  { href: '/theory', label: 'Lý thuyết', prefetch: true },
  { href: '/practice', label: 'Luyện tập', prefetch: false },
  { href: '/wordlist', label: 'Sổ tay', prefetch: false },
]

export function SiteHeader() {
  const path = usePathname() || '/'
  // Prefix, not equality: /dictionary/en/hello is still the lookup.
  // Longest first, so a future nested route marks its own item rather than its parent's.
  const current = NAV.map((n) => n.href)
    .filter((h) => path === h || path.startsWith(h + '/'))
    .sort((a, b) => b.length - a.length)[0]
  return (
    <header className="sticky top-0 z-30 border-b border-black/10 bg-white/85 backdrop-blur">
      <nav className="mx-auto flex max-w-page flex-wrap items-center gap-1 px-6 py-3">
        <Link href="/" className="mr-auto text-lg font-bold tracking-tight" aria-label="Về trang chủ Zhesen">
          Zhesen
        </Link>
        {/* One row holds the brand, the four sections and the account corner down to
            640px. Below that they need 449px against 390px of screen, so the sections
            take a line of their own under the brand rather than running off the edge. */}
        <div className="flex items-center gap-1 max-sm:order-last max-sm:mt-2 max-sm:w-full max-sm:justify-between">
          {NAV.map((n) => {
            const active = n.href === current
            return (
              <Link
                key={n.href}
                href={n.href}
                prefetch={n.prefetch}
                className={`relative rounded-lg px-3 py-1.5 text-sm ${active ? 'bg-black/10 font-medium text-black' : 'text-black/60 hover:bg-black/5'}`}
              >
                {n.label}
                {/* Only the two that are not prefetched: the others arrive from the edge
                    cache well inside the dot's own delay. */}
                {!n.prefetch && <LinkPending />}
              </Link>
            )
          })}
        </div>
        <AccountLink />
      </nav>
    </header>
  )
}
