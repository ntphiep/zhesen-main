'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

/** The three ways to ask the dictionary a question. They share one row because they are
 *  one task seen from three sides, and because the header cannot hold three more links. */
const TABS = [
  { href: '/dictionary', label: 'Tra từ' },
  { href: '/dictionary/reverse', label: 'Tra từ tiếng Việt' },
  { href: '/dictionary/text', label: 'Tra cả đoạn' },
]

export function LookupTabs() {
  const path = usePathname() || '/'
  return (
    <nav aria-label="Kiểu tra cứu" className="flex flex-wrap gap-2">
      {TABS.map((t) => {
        const active = path === t.href
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm ${active ? 'bg-black/10 font-medium text-black' : 'text-black/60 hover:bg-black/5'}`}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
