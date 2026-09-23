'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LinkPending } from '@/components/ui/LinkPending'

/** Not prefetched: every admin page runs exact counts against the database. */
const LINKS = [
  { href: '/admin', label: 'Tổng quan' },
  { href: '/admin/users', label: 'Tài khoản' },
  { href: '/admin/content', label: 'Nội dung' },
  { href: '/admin/health', label: 'Máy chủ' },
]

export function AdminNav() {
  const path = usePathname() || '/admin'
  return (
    <nav className="mt-4 flex flex-wrap gap-1 border-b border-black/10 pb-2" aria-label="Quản trị">
      {LINKS.map((l) => {
        const active = path === l.href
        return (
          <Link
            key={l.href}
            href={l.href}
            prefetch={false}
            aria-current={active ? 'page' : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm ${active ? 'bg-black/10 font-medium text-black' : 'text-black/60 hover:bg-black/5'}`}
          >
            {l.label}
            <LinkPending />
          </Link>
        )
      })}
    </nav>
  )
}
