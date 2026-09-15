'use client'
import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { accountKind, type AccountKind } from '@/lib/auth/account'

/**
 * Which account this browser carries, read in the client on purpose: reading it
 * in a shared server component would call `cookies()` on every route and stop
 * the prerendered pages from being prerendered.
 *
 * `kind === null` means "not decided yet", and callers render nothing rather
 * than a guess that changes a frame later under the reader's cursor.
 */
export function useAccount(): { kind: AccountKind | null; email: string | null } {
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

  return { kind, email }
}

/** The notebook needs an account. Which page the sign-in prompt points at
 *  depends on what this browser already holds: a legacy anonymous session goes
 *  to /register, which attaches an email to the SAME account so saved words
 *  survive; a browser with nothing goes to /login. */
export function signInHref(kind: AccountKind | null): string {
  return kind === 'anonymous' ? '/register' : '/login'
}
