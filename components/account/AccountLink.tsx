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
 * are prerendered today and would stop being. The cost is one frame with nothing
 * in this corner, which is why it renders nothing rather than a guess that then
 * changes under the reader.
 */
export function AccountLink() {
  const { kind, email } = useAccount()

  if (kind === null) return null

  if (kind === 'permanent') {
    return (
      <Link
        href="/account"
        className="ml-2 max-w-40 truncate rounded-lg px-3 py-1.5 text-sm text-black/60 hover:bg-black/5"
        title={email ?? undefined}
      >
        {email}
      </Link>
    )
  }

  return (
    <div className="ml-2 flex items-center gap-1">
      <Link
        href="/login"
        className="rounded-lg px-3 py-1.5 text-sm text-black/60 hover:bg-black/5"
      >
        Đăng nhập
      </Link>
      <Link
        href="/register"
        className="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-black/85"
      >
        Đăng ký
      </Link>
    </div>
  )
}
