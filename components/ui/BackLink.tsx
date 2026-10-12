import Link from 'next/link'
import type { ReactNode } from 'react'

/** A page's way back up, styled by `.back-link` in `app/globals.css`. */
export function BackLink({ href, prefetch, children }: { href: string; prefetch?: boolean; children: ReactNode }) {
  return (
    <Link href={href} prefetch={prefetch} className="back-link">
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 10H4M9 5l-5 5 5 5" /></svg>
      <span>{children}</span>
    </Link>
  )
}
