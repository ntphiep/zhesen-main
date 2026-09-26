'use client'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { accountKind, type AccountKind } from '@/lib/auth/account'
import { loadSupabaseClient } from '@/lib/supabase/loadClient'

/** Which account this browser carries. Must stay client-side: reading it in a shared server
 *  component calls `cookies()` on every route and stops the prerendered pages prerendering.
 *  `kind === null` means not decided yet, and callers render nothing rather than a guess. */
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
    // Dynamic import: this hook runs in the header of every route, and a static one puts
    // all 62.2 kB gzipped of supabase-js on the blocking path of pages that query nothing.
    void loadSupabaseClient().then(({ createClient }) => {
      if (!live) return
      const supabase = createClient()
      // `getSession`, never `getUser`: this only decides which links to draw, and `getUser`
      // is a round trip to the auth server each time. auth-js says so in `getUser`'s own
      // JSDoc (node_modules/@supabase/auth-js/dist/module/GoTrueClient.d.ts). Access is
      // still granted on the server, by requirePermanentAccount and RLS.
      supabase.auth.getSession().then(({ data }) => apply(data.session?.user ?? null))
      const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => apply(session?.user ?? null))
      unsubscribe = () => sub.subscription.unsubscribe()
    })
    return () => { live = false; unsubscribe() }
  }, [])

  return { kind, email }
}

/** An anonymous session must go to /register, which attaches an email to the SAME account
 *  so saved words survive; a browser holding nothing goes to /login. */
export function signInHref(kind: AccountKind | null): string {
  return kind === 'anonymous' ? '/register' : '/login'
}
