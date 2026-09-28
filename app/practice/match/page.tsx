import { MatchClient } from '@/components/practice/MatchClient'
import { createClient } from '@/lib/supabase/server'
import { requirePermanentAccount } from '@/lib/auth/guard'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Ghép cặp',
  description: 'Nối từ với nghĩa.',
})

// "Ghép cặp": Quizlet-style timed matching of words to meanings.
export default async function Page() {
  const supabase = await createClient()
  await requirePermanentAccount(supabase, '/practice/match')
  return <MatchClient />
}
