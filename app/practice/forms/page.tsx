import { TypingSession } from '@/components/practice/TypingSession'
import { createClient } from '@/lib/supabase/server'
import { requirePermanentAccount } from '@/lib/auth/guard'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Dạng từ',
  description: 'Gõ dạng quá khứ, số nhiều hay so sánh của từ.',
})

// "Dạng từ": a saved English word and one of its forms to type: went, children, better.
export default async function Page() {
  const supabase = await createClient()
  await requirePermanentAccount(supabase, '/practice/forms')
  return <TypingSession mode="forms" />
}
