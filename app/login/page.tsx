import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { countWords } from '@/lib/wordlist/store'
import { accountKind } from '@/lib/auth/account'
import { AuthForm } from '@/components/account/AuthForm'

export const metadata = { title: 'Đăng nhập · Zhesen' }

export default async function LoginPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const kind = accountKind(data.user)
  if (kind === 'permanent') redirect('/account')

  // Signing in swaps the account, so a browser already holding words must be
  // stopped before it can. The count is read here rather than in the form so the
  // guard is in place the moment the page renders.
  const localWordCount = kind === 'anonymous' ? await countWords(supabase) : 0

  return (
    <main className="px-6 py-14">
      <AuthForm mode="login" localWordCount={localWordCount} hasAnonymousSession={kind === 'anonymous'} />
    </main>
  )
}
