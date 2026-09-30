import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { countWords } from '@/lib/wordlist/store'
import { accountKind } from '@/lib/auth/account'
import { safeNext } from '@/lib/auth/redirect'
import { AuthForm } from '@/components/account/AuthForm'
import s from '@/components/account/Account.module.css'

export const metadata = { title: 'Tạo tài khoản' }

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const supabase = await createClient()
  const [{ data }, sp] = await Promise.all([supabase.auth.getUser(), searchParams])
  const kind = accountKind(data.user)
  if (kind === 'permanent') redirect('/account')

  // A visitor sent here from the notebook or a dictionary page comes back
  // there once the account is live. Confined to this site by the same guard the
  // emailed link uses.
  const next = safeNext(typeof sp.next === 'string' ? sp.next : null, 'https://zhesen.invalid')

  // An anonymous session with words in it turns this page into an upgrade of
  // that account rather than a new one; the form needs the number to say so.
  const localWordCount = kind === 'anonymous' ? await countWords(supabase) : 0

  return (
    // Centred in what is left of the viewport under the header. Pinned to the
    // top it read as a form dropped on a blank page, with the whole lower half
    // empty.
    <main className={`${s.auth} font-ui`}>
      <AuthForm mode="register" localWordCount={localWordCount} hasAnonymousSession={kind === 'anonymous'} next={next} />
    </main>
  )
}
