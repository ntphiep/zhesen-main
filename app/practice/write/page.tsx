import { TypingSession } from '@/components/practice/TypingSession'
import { createClient } from '@/lib/supabase/server'
import { requirePermanentAccount } from '@/lib/auth/guard'
import { pageMetadata } from '@/lib/site'
import { parseSubset } from '@/lib/practice/subset'

export const metadata = pageMetadata({
  title: 'Viết từ',
  description: 'Nhìn nghĩa rồi gõ từ.',
})

// "Viết từ": show a Vietnamese meaning, type the English word.
// `?word=`, `?entry=`, `?level=` or `?due=` narrow the round (`lib/practice/subset.ts`). Read after
// the guard: a signed-out visitor gets no round to narrow.
export default async function Page(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient()
  await requirePermanentAccount(supabase, '/practice/write')
  const only = parseSubset(await props.searchParams)
  return <TypingSession mode="write" only={only} />
}
