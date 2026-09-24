'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LinkPending } from '@/components/ui/LinkPending'

/** Not prefetched: every admin page runs exact counts or AWS reads. A group with no page
 *  yet is left out rather than shown with dead links. */
export const NAV_GROUPS: { label: string; links: { href: string; label: string }[] }[] = [
  {
    label: 'Theo dõi',
    links: [
      { href: '/admin', label: 'Tổng quan' },
      { href: '/admin/architecture', label: 'Kiến trúc' },
      { href: '/admin/data', label: 'Dữ liệu' },
      { href: '/admin/monitor', label: 'Giám sát' },
    ],
  },
  {
    label: 'Quản lý',
    links: [
      { href: '/admin/infra', label: 'Hạ tầng' },
      { href: '/admin/console', label: 'Console' },
      { href: '/admin/users', label: 'Tài khoản' },
      { href: '/admin/content', label: 'Nội dung' },
      { href: '/admin/audit', label: 'Nhật ký' },
    ],
  },
]

/** Longest matching prefix, so /admin/data?table=x marks Dữ liệu and not Tổng quan. */
function current(path: string): string | undefined {
  return NAV_GROUPS.flatMap((g) => g.links.map((l) => l.href))
    .filter((h) => path === h || path.startsWith(h + '/'))
    .sort((a, b) => b.length - a.length)[0]
}

/** A sidebar on a wide screen; one scrollable row of links on a phone. */
export function AdminNav() {
  const active = current(usePathname() || '/admin')
  return (
    <nav aria-label="Quản trị" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
      <div className="flex gap-1 lg:flex-col lg:gap-6">
        {NAV_GROUPS.map((g) => (
          <div key={g.label} className="flex shrink-0 gap-1 lg:flex-col lg:gap-0.5">
            <div className="hidden px-3 pb-1 text-xs font-medium text-black/40 lg:block">{g.label}</div>
            {g.links.map((l) => {
              const on = l.href === active
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  prefetch={false}
                  aria-current={on ? 'page' : undefined}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${on ? 'bg-black/[0.07] font-medium text-black' : 'text-black/60 hover:bg-black/5 hover:text-black'}`}
                >
                  {l.label}
                  <LinkPending />
                </Link>
              )
            })}
          </div>
        ))}
      </div>
    </nav>
  )
}
