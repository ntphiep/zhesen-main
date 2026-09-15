// app/wordlist/page.tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { accountKind } from '@/lib/auth/account'
import { listWords } from '@/lib/wordlist/store'
import { countDueCards } from '@/lib/wordlist/review'
import { WordlistClient } from '@/components/wordlist/WordlistClient'

export default async function WordlistPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  // The notebook belongs to an account. An anonymous browser is sent to
  // /register, which attaches an email to the SAME account so its saved words
  // survive the trip; a browser with nothing goes to /login. The page asked for
  // rides back in `next` so the sign-in lands them here.
  const supabase = await createClient()
  const [{ data }, sp] = await Promise.all([supabase.auth.getUser(), searchParams])
  const kind = accountKind(data.user)
  if (kind !== 'permanent') {
    const door = kind === 'anonymous' ? '/register' : '/login'
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(sp)) if (typeof value === 'string') params.set(key, value)
    params.set('next', '/wordlist')
    redirect(`${door}?${params}`)
  }

  const [words, due] = await Promise.all([listWords(supabase), countDueCards(supabase)])
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Sổ tay</h1>
        {words.length > 0 && (
          <Link
            href="/practice"
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${due > 0 ? 'bg-black text-white' : 'border border-black/15 text-black/70 hover:bg-black/5'}`}
          >
            Luyện tập{due > 0 ? ` (${due})` : ''}
          </Link>
        )}
      </div>
      <p className="mt-1 text-sm text-black/60">Các từ bạn đã lưu.</p>
      <div className="mt-6">
        <WordlistClient initialWords={words} />
      </div>
    </main>
  )
}
