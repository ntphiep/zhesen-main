import { QuizClient } from '@/components/practice/QuizClient'
import { createClient } from '@/lib/supabase/server'
import { requirePermanentAccount } from '@/lib/auth/guard'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Ghép cụm từ',
  description: 'Chọn từ còn thiếu trong cụm từ đã lưu.',
})

// "Ghép cụm từ": a saved phrase with its particle, light verb or preposition missing.
export default async function Page() {
  const supabase = await createClient()
  await requirePermanentAccount(supabase, '/practice/phrase')
  return <QuizClient mode="phrase" />
}
