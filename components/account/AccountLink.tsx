'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAccount } from '@/lib/hooks/useAccount'
import { LinkPending } from '@/components/ui/LinkPending'

/**
 * The way to /admin, drawn only once `public.is_admin()` says so. Asked once per mount,
 * and the header mounts once per tab. A failed call draws nothing; the page itself is
 * gated on the server and in the database, so this decides a link, not access.
 */
function AdminLink() {
  const [admin, setAdmin] = useState(false)

  useEffect(() => {
    let live = true
    void import('@/lib/supabase/client')
      .then(({ createClient }) => createClient().rpc('is_admin'))
      .then(({ data }) => { if (live) setAdmin(data === true) })
      .catch(() => {})
    return () => { live = false }
  }, [])

  if (!admin) return null
  // Not on a phone: at 390 px the header has no room for a sixth link and scrolls sideways.
  return (
    <Link
      href="/admin"
      prefetch={false}
      className="ml-2 hidden rounded-lg px-3 py-1.5 text-sm text-black/60 hover:bg-black/5 sm:inline-block"
    >
      Quản trị
      <LinkPending />
    </Link>
  )
}

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
      <>
        {/* Keyed on the address: a different account signing in asks again. */}
        <AdminLink key={email} />
        <Link
          href="/account"
          prefetch={false}
          className="ml-2 max-w-40 truncate rounded-lg px-3 py-1.5 text-sm text-black/60 hover:bg-black/5"
          title={email ?? undefined}
        >
          {email}
          <LinkPending />
        </Link>
      </>
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
        <LinkPending />
      </Link>
      <Link
        href="/register"
        prefetch={false}
        className="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-black/85"
      >
        Đăng ký
        <LinkPending />
      </Link>
    </div>
  )
}
