import { QuizClient } from '@/components/practice/QuizClient'
import { createClient } from '@/lib/supabase/server'
import { requirePermanentAccount } from '@/lib/auth/guard'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Nghe chọn nghĩa',
  description: 'Nghe từ rồi chọn nghĩa đúng.',
})

// "Nghe chọn nghĩa": the word is heard, not read, and its meaning picked among four.
export default async function Page() {
  const supabase = await createClient()
  await requirePermanentAccount(supabase, '/practice/listen')
  return <QuizClient mode="listen" />
}
