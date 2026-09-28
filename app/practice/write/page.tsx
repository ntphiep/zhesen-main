import { TypingSession } from '@/components/practice/TypingSession'
import { createClient } from '@/lib/supabase/server'
import { requirePermanentAccount } from '@/lib/auth/guard'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Viết từ',
  description: 'Nhìn nghĩa rồi gõ từ.',
})

// "Viết từ": show a Vietnamese meaning, type the English word.
export default async function Page() {
  const supabase = await createClient()
  await requirePermanentAccount(supabase, '/practice/write')
  return <TypingSession mode="write" />
}
