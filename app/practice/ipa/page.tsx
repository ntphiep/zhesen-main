import { TypingSession } from '@/components/practice/TypingSession'
import { createClient } from '@/lib/supabase/server'
import { requirePermanentAccount } from '@/lib/auth/guard'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Đọc phiên âm',
  description: 'Đọc phiên âm IPA rồi gõ từ.',
})

// "Đọc phiên âm": the IPA of a saved word, the word typed back.
export default async function Page() {
  const supabase = await createClient()
  await requirePermanentAccount(supabase, '/practice/ipa')
  return <TypingSession mode="ipa" />
}
