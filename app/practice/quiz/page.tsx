import { QuizClient } from '@/components/practice/QuizClient'
import { createClient } from '@/lib/supabase/server'
import { requirePermanentAccount } from '@/lib/auth/guard'
import { pageMetadata } from '@/lib/site'
import { parseSubset } from '@/lib/practice/subset'

export const metadata = pageMetadata({
  title: 'Kiểm tra',
  description: 'Chọn nghĩa đúng trong bốn đáp án.',
})

// "Kiểm tra": multiple-choice recall quiz over the wordlist.
// `?word=`, `?entry=`, `?level=` or `?due=` narrow the round (`lib/practice/subset.ts`). Read after
// the guard: a signed-out visitor gets no round to narrow.
export default async function Page(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient()
  await requirePermanentAccount(supabase, '/practice/quiz')
  const only = parseSubset(await props.searchParams)
  return <QuizClient only={only} />
}
