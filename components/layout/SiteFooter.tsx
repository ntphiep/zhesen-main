'use client'
import Link from 'next/link'
import { BrandMark } from '@/components/layout/SiteHeader'
import { useAccount } from '@/lib/hooks/useAccount'

/**
 * Every link is `prefetch={false}`: the header already prefetches the cached routes, and
 * the footer on every page would otherwise fetch /practice, /wordlist and /account, which
 * read the session.
 */
const LEARN = [
  { href: '/dictionary', label: 'Dịch' },
  { href: '/theory', label: 'Lý thuyết' },
  { href: '/practice', label: 'Luyện tập' },
  { href: '/wordlist', label: 'Sổ tay' },
]

const LINK = 'text-[0.9375rem] font-semibold text-(--zs-ink) hover:underline hover:underline-offset-[0.2em]'
const HEADING = 'mb-2.5 text-xs font-bold text-(--zs-soft)'

export function SiteFooter() {
  const { kind } = useAccount()
  const account = kind === 'permanent'
    ? [{ href: '/account', label: 'Tài khoản của tôi' }]
    : [{ href: '/register', label: 'Đăng ký' }, { href: '/login', label: 'Đăng nhập' }]
  return (
    <footer className="border-t-[1.5px] border-(--zs-line) bg-(--zs-bg) pt-14 pb-20 font-ui sm:pb-8">
      <div className="mx-auto max-w-page px-6">
        <div className="flex flex-wrap justify-between gap-x-16 gap-y-8">
          <div>
            <Link href="/" prefetch={false} className="inline-flex" aria-label="Về trang chủ Zhesen">
              <BrandMark />
            </Link>
            <p className="mt-3 max-w-[22rem] text-[0.9375rem] leading-normal text-(--zs-soft)">
              Học tiếng Anh, tiếng Trung và tiếng Tây Ban Nha bằng tiếng Việt.
            </p>
          </div>
          <nav aria-label="Chân trang" className="flex gap-10 sm:gap-16">
            <div>
              <h2 className={HEADING}>Học</h2>
              <ul className="grid gap-2">
                {LEARN.map((l) => (
                  <li key={l.href}><Link href={l.href} prefetch={false} className={LINK}>{l.label}</Link></li>
                ))}
              </ul>
            </div>
            {/* Laid out while the account is unknown, hidden, as the header's corner is. */}
            <div className={kind === null ? 'invisible' : undefined} aria-hidden={kind === null || undefined}>
              <h2 className={HEADING}>Tài khoản</h2>
              <ul className="grid gap-2">
                {account.map((l) => (
                  <li key={l.href}><Link href={l.href} prefetch={false} className={LINK}>{l.label}</Link></li>
                ))}
              </ul>
            </div>
          </nav>
        </div>
        <p className="mt-10 border-t border-(--zs-line) pt-5 text-[0.8125rem] text-(--zs-soft)">© 2026 Zhesen</p>
      </div>
    </footer>
  )
}
