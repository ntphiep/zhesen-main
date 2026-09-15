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
    // Centred in what is left of the viewport under the header. Pinned to the
    // top it read as a form dropped on a blank page, with the whole lower half
    // empty.
    <main className="flex min-h-[calc(100dvh-8rem)] items-center justify-center bg-black/[0.02] px-6 py-12">
      <AuthForm mode="login" localWordCount={localWordCount} hasAnonymousSession={kind === 'anonymous'} />
    </main>
  )
}
