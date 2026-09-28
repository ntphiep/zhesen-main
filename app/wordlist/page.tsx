import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requirePermanentAccount } from '@/lib/auth/guard'
import { listWords } from '@/lib/wordlist/store'
import { countDueCards } from '@/lib/wordlist/review'
import { WordlistClient } from '@/components/wordlist/WordlistClient'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Sổ tay',
  description: 'Xem và sửa các từ đã lưu.',
})

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
  const sp = await searchParams
  const carry = Object.fromEntries(
    Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === 'string'),
  )
  await requirePermanentAccount(supabase, '/wordlist', carry)

  const [words, due] = await Promise.all([listWords(supabase), countDueCards(supabase)])
  return (
    <main className="mx-auto max-w-page px-6 py-10">
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
      <p className="mt-1 text-sm text-black/60">Xem và sửa các từ đã lưu.</p>
      <div className="mt-6">
        <WordlistClient initialWords={words} />
      </div>
    </main>
  )
}
