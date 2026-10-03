'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AccountLink } from '@/components/account/AccountLink'
import { LinkPending } from '@/components/ui/LinkPending'

/**
 * `prefetch` is off for every route rendered per request. A Link prefetches as soon as
 * it enters the viewport and this header is on every page, so otherwise each page load
 * also renders /dictionary, /practice and /wordlist, which query Supabase. /dictionary
 * answers `private, no-store` because it reads its search parameters. Theory stays on:
 * the edge cache answers it.
 */
const NAV = [
  { href: '/dictionary', label: 'Dịch', prefetch: false },
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
    <header className="sticky top-0 z-30 bg-(--zs-bg)/88 font-ui backdrop-blur-[10px]">
      <nav className="mx-auto flex max-w-page flex-wrap items-center gap-1 px-6 py-2.5 sm:h-16 sm:py-0">
        <Link href="/" className="mr-auto" aria-label="Về trang chủ Zhesen">
          <BrandMark />
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
                className={`relative rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors duration-150 ease-std hover:bg-(--zs-chip) hover:text-(--zs-ink) sm:text-[0.9375rem] ${active ? 'bg-(--zs-chip) text-(--zs-ink)' : 'text-(--zs-soft)'}`}
              >
                {n.label}
                {/* Only the ones not prefetched: theory arrives from the edge cache well
                    inside the dot's own delay. */}
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

/** The three-bar mark and the name, shared with the footer. */
export function BrandMark() {
  return (
    <span className="flex items-center gap-2.5 text-[1.3125rem] font-extrabold tracking-[-0.02em] text-(--zs-ink)">
      <i aria-hidden="true" className="grid h-5 grid-cols-[repeat(3,6px)] gap-0.5">
        <b className="rounded-[2px] bg-sea-700" />
        <b className="rounded-[2px] bg-sea-600" />
        <b className="rounded-[2px] bg-sea-300" />
      </i>
      Zhesen
    </span>
  )
}
