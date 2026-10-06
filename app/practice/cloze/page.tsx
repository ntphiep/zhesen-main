import { TypingSession } from '@/components/practice/TypingSession'
import { createClient } from '@/lib/supabase/server'
import { requirePermanentAccount } from '@/lib/auth/guard'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Điền vào câu',
  description: 'Gõ từ còn thiếu trong câu ví dụ.',
})

// "Điền vào câu": a saved word cut out of an example sentence, typed back in the form the
// sentence needs.
export default async function Page() {
  const supabase = await createClient()
  await requirePermanentAccount(supabase, '/practice/cloze')
  return <TypingSession mode="cloze" />
}
