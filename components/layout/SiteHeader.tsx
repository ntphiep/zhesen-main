'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/dictionary', label: 'Tra cứu' },
  { href: '/practice', label: 'Luyện tập' },
  { href: '/wordlist', label: 'Sổ tay' },
]

export function SiteHeader() {
  const path = usePathname() || '/'
  return (
    <header className="sticky top-0 z-30 border-b border-black/10 bg-white/85 backdrop-blur">
      <nav className="mx-auto flex max-w-3xl items-center gap-1 px-6 py-3">
        <Link href="/" className="mr-auto text-lg font-bold tracking-tight" aria-label="Về trang chủ Zhesen">
          Zhesen
        </Link>
        {NAV.map((n) => {
          const active = path === n.href || path.startsWith(n.href + '/')
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-lg px-3 py-1.5 text-sm ${active ? 'bg-black/10 font-medium text-black' : 'text-black/60 hover:bg-black/5'}`}
            >
              {n.label}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
