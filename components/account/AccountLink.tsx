'use client'
import Link from 'next/link'
import { useAccount } from '@/lib/hooks/useAccount'

/**
 * The account corner of the header: the signed-in address, or the two doors
 * every site has, sign in and sign up.
 *
 * Read in the browser rather than in the root layout on purpose. Reading the
 * session on the server would call `cookies()` in a layout that wraps every
 * route, which opts the whole site into dynamic rendering -- the grammar pages
 * are prerendered today and would stop being.
 *
 * The cost is one frame before the answer arrives. The brand holds `mr-auto`, so
 * a corner that appears only then drags every nav item left; the signed-out pair
 * is therefore laid out from the first paint and merely hidden, which reserves
 * the right width without a hardcoded one. `visibility: hidden` also keeps it
 * out of the tab order.
 */
export function AccountLink() {
  const { kind, email } = useAccount()

  if (kind === 'permanent') {
    return (
      <Link
        href="/account"
        prefetch={false}
        className="ml-2 max-w-40 truncate rounded-lg px-3 py-1.5 text-sm text-black/60 hover:bg-black/5"
        title={email ?? undefined}
      >
        {email}
      </Link>
    )
  }

  return (
    <div className={`ml-2 flex items-center gap-1${kind === null ? ' invisible' : ''}`} aria-hidden={kind === null || undefined}>
      <Link
        href="/login"
        prefetch={false}
        className="rounded-lg px-3 py-1.5 text-sm text-black/60 hover:bg-black/5"
      >
        Đăng nhập
      </Link>
      <Link
        href="/register"
        prefetch={false}
        className="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-black/85"
      >
        Đăng ký
      </Link>
    </div>
  )
}
