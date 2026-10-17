'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AccountLink } from '@/components/account/AccountLink'
import { LinkPending } from '@/components/ui/LinkPending'
import { ZMark } from '@/components/layout/ZMark'

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
        <Link href="/" className="group mr-auto" aria-label="Về trang chủ Zhesen">
          <BrandMark collapsed />
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

/** The name with the mark as its Z, as in public/brand/zhesen-logo.svg: the mark one cap height
 *  tall (0.74em in Be Vietnam Pro), "hesen" in the mark's three blues. `collapsed` shows the mark
 *  alone until the enclosing `group` link is hovered or focused. --zs-logo-* step one shade
 *  lighter on the dark theme. */
export function BrandMark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <span className="flex items-baseline text-[1.625rem] leading-none font-extrabold tracking-[-0.02em]">
      <ZMark fills={LOGO_FILLS} height={19} className="h-[0.74em] w-auto flex-none" />
      <span className={collapsed ? 'max-w-0 overflow-hidden opacity-0 transition-[max-width,opacity] duration-200 ease-std group-hover:max-w-[4em] group-hover:opacity-100 group-focus-visible:max-w-[4em] group-focus-visible:opacity-100 motion-reduce:transition-none' : undefined}>
        {/* The Z's right side bearing less the tracking. */}
        <span className="ml-[0.025em] bg-linear-to-r from-(--zs-logo-1) via-(--zs-logo-2) to-(--zs-logo-3) bg-clip-text text-transparent">hesen</span>
      </span>
    </span>
  )
}

const LOGO_FILLS = ['var(--zs-logo-1)', 'var(--zs-logo-2)', 'var(--zs-logo-3)'] as const
