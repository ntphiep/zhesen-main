'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { accountKind, type AccountKind } from '@/lib/auth/account'

/**
 * The account corner of the header: who you are, or the way to become someone.
 *
 * Read in the browser rather than in the root layout on purpose. Reading the
 * session on the server would call `cookies()` in a layout that wraps every
 * route, which opts the whole site into dynamic rendering -- the grammar pages
 * are prerendered today and would stop being. The cost is one frame with nothing
 * in this corner, which is why it renders nothing rather than a guess that then
 * changes under the reader.
 */
export function AccountLink() {
  const supabase = useMemo(() => createClient(), [])
  const [kind, setKind] = useState<AccountKind | null>(null)
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    const apply = (user: User | null) => {
      if (!live) return
      setKind(accountKind(user))
      setEmail(user?.email ?? null)
    }
    supabase.auth.getUser().then(({ data }) => apply(data.user ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => apply(session?.user ?? null))
    return () => { live = false; sub.subscription.unsubscribe() }
  }, [supabase])

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

  // An anonymous session holds words nobody else can reach, so it is pointed at
  // registration, which attaches an email to that same account. "Đăng nhập" here
  // would invite the one action that abandons them.
  return (
    <Link
      href={kind === 'anonymous' ? '/register' : '/login'}
      className="ml-2 rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5"
    >
      {kind === 'anonymous' ? 'Lưu sổ tay' : 'Đăng nhập'}
    </Link>
  )
}
