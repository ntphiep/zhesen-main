import { MatchClient } from '@/components/practice/MatchClient'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Ghép cặp',
  description: 'Nối từ với nghĩa.',
})

// "Ghép cặp": Quizlet-style timed matching of words to meanings.
export default function Page() {
  return <MatchClient />
}
