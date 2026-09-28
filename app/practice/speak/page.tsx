import { SpeakSession } from '@/components/practice/SpeakSession'
import { createClient } from '@/lib/supabase/server'
import { requirePermanentAccount } from '@/lib/auth/guard'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Luyện nói',
  description: 'Đọc to từng từ để kiểm tra phát âm.',
})

// "Luyện nói" (shadowing): say the word back; the browser transcribes and grades it.
export default async function Page() {
  const supabase = await createClient()
  await requirePermanentAccount(supabase, '/practice/speak')
  return <SpeakSession />
}
