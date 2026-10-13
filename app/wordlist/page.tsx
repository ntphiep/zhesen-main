import { createClient } from '@/lib/supabase/server'
import { requirePermanentAccount } from '@/lib/auth/guard'
import { listWords } from '@/lib/wordlist/store'
import { countDueCards } from '@/lib/wordlist/review'
import { WordlistClient } from '@/components/wordlist/WordlistClient'
import { pageMetadata } from '@/lib/site'
import { newsreader } from '@/components/home/fonts'
import s from '@/components/wordlist/Wordlist.module.css'

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
    <main className={`${s.nb} ${newsreader.variable} mx-auto max-w-page px-6 pt-8 pb-16 font-ui`}>
      <WordlistClient initialWords={words} due={due} />
    </main>
  )
}
