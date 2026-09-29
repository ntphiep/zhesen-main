'use client'
import Link from 'next/link'
import { useAccount } from '@/lib/hooks/useAccount'
import { LinkPending } from '@/components/ui/LinkPending'

const QUIET = 'rounded-lg px-3 py-1.5 text-sm font-semibold text-(--zs-soft) transition-colors duration-150 ease-std hover:bg-(--zs-chip) hover:text-(--zs-ink) sm:text-[0.9375rem]'

/**
 * The account corner of the header: the signed-in address, or sign in and sign up.
 *
 * Read in the browser, not in the root layout: reading the session there calls
 * `cookies()` in a layout wrapping every route, which opts the whole site into
 * dynamic rendering, and the grammar pages are prerendered today.
 *
 * The cost is one frame. The brand holds `mr-auto`, so a corner appearing only then
 * drags every nav item left; the signed-out pair is laid out from the first paint and
 * merely hidden, which reserves the width and keeps it out of the tab order.
 */
export function AccountLink() {
  const { kind, email } = useAccount()

  if (kind === 'permanent') {
    return (
      <Link
        href="/account"
        prefetch={false}
        className={`relative ml-2 max-w-40 truncate ${QUIET}`}
        title={email ?? undefined}
      >
        {email}
        <LinkPending />
      </Link>
    )
  }

  return (
    <div className={`ml-2 flex items-center gap-1${kind === null ? ' invisible' : ''}`} aria-hidden={kind === null || undefined}>
      <Link
        href="/login"
        prefetch={false}
        className={`relative ${QUIET}`}
      >
        Đăng nhập
        <LinkPending />
      </Link>
      <Link
        href="/register"
        prefetch={false}
        className="relative rounded-lg bg-(--zs-btn) px-3 py-1.5 text-sm font-semibold text-(--zs-btn-ink) transition-colors duration-150 ease-std hover:bg-(--zs-btn-hover) sm:text-[0.9375rem]"
      >
        Đăng ký
        <LinkPending />
      </Link>
    </div>
  )
}
