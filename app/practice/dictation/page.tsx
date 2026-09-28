import { TypingSession } from '@/components/practice/TypingSession'
import { createClient } from '@/lib/supabase/server'
import { requirePermanentAccount } from '@/lib/auth/guard'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Nghe và chép',
  description: 'Nghe phát âm rồi gõ lại từ.',
})

// "Nghe và chép": play the word's audio, type what you hear.
export default async function Page() {
  const supabase = await createClient()
  await requirePermanentAccount(supabase, '/practice/dictation')
  return <TypingSession mode="dictation" />
}
