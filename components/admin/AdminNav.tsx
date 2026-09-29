'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LinkPending } from '@/components/ui/LinkPending'

/** Not prefetched: every admin page runs exact counts or AWS reads. A group with no page
 *  yet is left out rather than shown with dead links. */
export const NAV_GROUPS: { label: string; links: { href: string; label: string }[] }[] = [
  {
    label: 'Observe',
    links: [
      { href: '/admin', label: 'Overview' },
      { href: '/admin/monitor', label: 'Monitor' },
      { href: '/admin/containers', label: 'Containers' },
      { href: '/admin/database', label: 'Database' },
    ],
  },
  {
    label: 'Operate',
    links: [
      { href: '/admin/infra', label: 'Infrastructure' },
      { href: '/admin/secrets', label: 'Secrets' },
      { href: '/admin/router', label: 'AI router' },
      { href: '/admin/users', label: 'Users' },
      { href: '/admin/content', label: 'Content' },
      { href: '/admin/feedback', label: 'Feedback' },
      { href: '/admin/learner', label: 'Learner layer' },
      { href: '/admin/audit', label: 'Audit log' },
    ],
  },
]

/** Longest matching prefix, so /admin/database?table=x marks Database and not Overview. */
function current(path: string): string | undefined {
  return NAV_GROUPS.flatMap((g) => g.links.map((l) => l.href))
    .filter((h) => path === h || path.startsWith(h + '/'))
    .sort((a, b) => b.length - a.length)[0]
}

/** A sidebar on a wide screen; one scrollable row of links on a phone. */
export function AdminNav() {
  const active = current(usePathname() || '/admin')
  return (
    <nav aria-label="Admin" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
      <div className="flex w-max gap-0.5 rounded-lg bg-(--zs-chip) p-0.5 lg:w-auto lg:flex-col lg:gap-5 lg:rounded-none lg:bg-transparent lg:p-0">
        {NAV_GROUPS.map((g) => (
          <div key={g.label} className="flex shrink-0 gap-0.5 lg:flex-col">
            <div className="hidden px-3 pb-1 text-xs font-semibold text-(--zs-soft) lg:block">{g.label}</div>
            {g.links.map((l) => {
              const on = l.href === active
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  prefetch={false}
                  aria-current={on ? 'page' : undefined}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors duration-150 ease-std motion-reduce:transition-none ${on ? 'bg-(--zs-btn) font-semibold text-(--zs-btn-ink) shadow-sm' : 'font-medium text-(--zs-soft) hover:bg-(--zs-bg)/60 hover:text-(--zs-ink)'}`}
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
