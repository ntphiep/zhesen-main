'use client'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
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
  const [kind, setKind] = useState<AccountKind | null>(null)
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    let unsubscribe = () => {}
    const apply = (user: User | null) => {
      if (!live) return
      setKind(accountKind(user))
      setEmail(user?.email ?? null)
    }
    // This hook runs in the header of every route, and a static import put the
    // whole of supabase-js -- 62.2 kB gzipped, auth plus realtime plus storage --
    // on the blocking path of pages that never query anything. Loading it here
    // costs nothing extra on screen: the caller already renders nothing until
    // getUser() returns, and that is a network round trip.
    void import('@/lib/supabase/client').then(({ createClient }) => {
      if (!live) return
      const supabase = createClient()
      // `getSession` and not `getUser`: this hook only decides which links the
      // header and the save button show, and `getUser` is a round trip to the
      // auth server for every one of them. Two components use this hook on a
      // dictionary entry page, so one page load made two such calls before
      // anything could be drawn. The installed auth-js says so itself: "Should
      // always be used when checking for user authorization on the server. On the
      // client, you can instead use getSession().session.user for faster results"
      // (node_modules/@supabase/auth-js/dist/module/GoTrueClient.d.ts, getUser).
      // Nothing here grants access; every page and table that does still verifies
      // on the server, through requirePermanentAccount and RLS.
      supabase.auth.getSession().then(({ data }) => apply(data.session?.user ?? null))
      const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => apply(session?.user ?? null))
      unsubscribe = () => sub.subscription.unsubscribe()
    })
    return () => { live = false; unsubscribe() }
  }, [])

  return { kind, email }
}

/** The notebook needs an account. Which page the sign-in prompt points at
 *  depends on what this browser already holds: a legacy anonymous session goes
 *  to /register, which attaches an email to the SAME account so saved words
 *  survive; a browser with nothing goes to /login. */
export function signInHref(kind: AccountKind | null): string {
  return kind === 'anonymous' ? '/register' : '/login'
}
