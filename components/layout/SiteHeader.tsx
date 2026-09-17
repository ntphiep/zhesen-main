'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AccountLink } from '@/components/account/AccountLink'
import { LinkPending } from '@/components/ui/LinkPending'

/**
 * `prefetch` is off for the two routes that read the session. A Link prefetches
 * as soon as it enters the viewport, and this header is in the viewport of every
 * page, so each page load was fetching /practice and /wordlist as well -- two
 * renders that each query Supabase, for a visitor who is reading a dictionary
 * entry and may never open either. The dictionary and grammar routes stay on,
 * because they are answered from the edge cache and cost the server nothing.
 */
const NAV = [
  { href: '/dictionary', label: 'Tra cứu', prefetch: true },
  { href: '/grammar', label: 'Ngữ pháp', prefetch: true },
  { href: '/practice', label: 'Luyện tập', prefetch: false },
  { href: '/wordlist', label: 'Sổ tay', prefetch: false },
]

export function SiteHeader() {
  const path = usePathname() || '/'
  return (
    <header className="sticky top-0 z-30 border-b border-black/10 bg-white/85 backdrop-blur">
      <nav className="mx-auto flex max-w-5xl items-center gap-1 px-6 py-3">
        <Link href="/" className="mr-auto text-lg font-bold tracking-tight" aria-label="Về trang chủ Zhesen">
          Zhesen
        </Link>
        {NAV.map((n) => {
          const active = path === n.href || path.startsWith(n.href + '/')
          return (
            <Link
              key={n.href}
              href={n.href}
              prefetch={n.prefetch}
              className={`rounded-lg px-3 py-1.5 text-sm ${active ? 'bg-black/10 font-medium text-black' : 'text-black/60 hover:bg-black/5'}`}
            >
              {n.label}
              {/* Only the two that are not prefetched: the other two arrive from
                  the edge cache in well under the dot's own delay. */}
              {!n.prefetch && <LinkPending />}
            </Link>
          )
        })}
        <AccountLink />
      </nav>
    </header>
  )
}
