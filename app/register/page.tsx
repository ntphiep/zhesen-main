import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { countWords } from '@/lib/wordlist/store'
import { accountKind } from '@/lib/auth/account'
import { AuthForm } from '@/components/account/AuthForm'

export const metadata = { title: 'Tạo tài khoản · Zhesen' }

export default async function RegisterPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const kind = accountKind(data.user)
  if (kind === 'permanent') redirect('/account')

  // An anonymous session with words in it turns this page into an upgrade of
  // that account rather than a new one; the form needs the number to say so.
  const localWordCount = kind === 'anonymous' ? await countWords(supabase) : 0

  return (
    // Centred in what is left of the viewport under the header. Pinned to the
    // top it read as a form dropped on a blank page, with the whole lower half
    // empty.
    <main className="flex min-h-[calc(100dvh-8rem)] items-center justify-center bg-black/[0.02] px-6 py-12">
      <AuthForm mode="register" localWordCount={localWordCount} hasAnonymousSession={kind === 'anonymous'} />
    </main>
  )
}
