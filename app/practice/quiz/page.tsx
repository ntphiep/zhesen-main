import { QuizClient } from '@/components/practice/QuizClient'
import { createClient } from '@/lib/supabase/server'
import { requirePermanentAccount } from '@/lib/auth/guard'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Kiểm tra',
  description: 'Chọn nghĩa đúng trong bốn đáp án.',
})

// "Kiểm tra": multiple-choice recall quiz over the wordlist.
export default async function Page() {
  const supabase = await createClient()
  await requirePermanentAccount(supabase, '/practice/quiz')
  return <QuizClient />
}
