import { WordlistReview } from '@/components/practice/WordlistReview'
import { createClient } from '@/lib/supabase/server'
import { requirePermanentAccount } from '@/lib/auth/guard'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Ôn từ',
  description: 'Ôn các từ đến hạn.',
})

// "Ôn từ": FSRS spaced-repetition review over due wordlist cards.
export default async function Page() {
  const supabase = await createClient()
  await requirePermanentAccount(supabase, '/practice/review')
  return <WordlistReview />
}
