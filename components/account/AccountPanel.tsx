'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { accountKind, type AccountKind } from '@/lib/auth/account'

/**
 * The warning that belongs next to the words themselves.
 *
 * An anonymous account lives in one browser's cookie: clearing site data loses
 * the wordlist, and it has happened here with 407 words. Saying so on the page
 * that shows those words is the only place a learner is thinking about them.
 *
 * The form used to live here too. It now lives at `/register` and `/login`,
 * which handle the three doors properly (attach, create, return) and can explain
 * themselves at full width; this panel points at the right one and stops. Two
 * implementations of one flow is how the wrong one gets reached.
 */
export function AccountPanel({ wordCount }: { wordCount: number }) {
  const supabase = useMemo(() => createClient(), [])
  const [kind, setKind] = useState<AccountKind | null>(null)

  useEffect(() => {
    let live = true
    const apply = (user: User | null) => { if (live) setKind(accountKind(user)) }
    supabase.auth.getUser().then(({ data }) => apply(data.user ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => apply(s?.user ?? null))
    return () => { live = false; sub.subscription.unsubscribe() }
  }, [supabase])

  // Nothing useful to say before we know which account this is, and nothing to
  // say at all once the words are safe.
  if (kind === null || kind === 'permanent') return null

  const atRisk = kind === 'anonymous' && wordCount > 0

  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${atRisk ? 'border-amber-300 bg-amber-50' : 'border-black/10'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={atRisk ? 'text-amber-900' : 'text-black/60'}>
          {atRisk
            ? `${wordCount} từ đang chỉ nằm trong trình duyệt này. Xoá dữ liệu duyệt web là mất.`
            : 'Sổ tay đang gắn với trình duyệt này.'}
        </span>
        <Link
          href={kind === 'anonymous' ? '/register' : '/login'}
          className="ml-auto font-medium text-black/70 hover:text-black hover:underline"
        >
          {atRisk ? 'Lưu bằng email' : 'Đăng nhập'}
        </Link>
      </div>
    </div>
  )
}
