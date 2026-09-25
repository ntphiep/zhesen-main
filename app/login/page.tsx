import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { countWords } from '@/lib/wordlist/store'
import { accountKind } from '@/lib/auth/account'
import { safeNext } from '@/lib/auth/redirect'
import { AuthForm } from '@/components/account/AuthForm'

export const metadata = { title: 'Đăng nhập' }

/** Why `app/auth/callback/route.ts` sent the reader here instead of on to the
 *  page they asked for. Without these the redirect landed on a blank form. */
const AUTH_NOTICE: Record<string, string> = {
  missing: 'Liên kết không hợp lệ. Đăng nhập lại.',
  failed: 'Liên kết đã hết hạn hoặc đã dùng. Đăng nhập lại.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const supabase = await createClient()
  const [{ data }, sp] = await Promise.all([supabase.auth.getUser(), searchParams])
  const kind = accountKind(data.user)
  if (kind === 'permanent') redirect('/account')

  // The notebook is not reachable without an account, and a word looked up
  // before signing in is worth saving afterwards: `next` carries the page the
  // visitor came from back through the form, confined to this site by the same
  // guard the emailed link uses.
  const next = safeNext(typeof sp.next === 'string' ? sp.next : null, 'https://zhesen.invalid')

  // Signing in swaps the account, so a browser already holding words must be
  // stopped before it can. The count is read here rather than in the form so the
  // guard is in place the moment the page renders.
  const localWordCount = kind === 'anonymous' ? await countWords(supabase) : 0

  return (
    // Centred in what is left of the viewport under the header. Pinned to the
    // top it read as a form dropped on a blank page, with the whole lower half
    // empty.
    <main className="flex min-h-[calc(100dvh-8rem)] items-center justify-center bg-black/[0.02] px-6 py-12">
      <AuthForm
        mode="login"
        localWordCount={localWordCount}
        hasAnonymousSession={kind === 'anonymous'}
        next={next}
        notice={typeof sp.auth === 'string' && Object.hasOwn(AUTH_NOTICE, sp.auth) ? AUTH_NOTICE[sp.auth] : undefined}
      />
    </main>
  )
}
