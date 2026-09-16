import { QuizClient } from '@/components/practice/QuizClient'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Kiểm tra',
  description: 'Trắc nghiệm bốn đáp án trên sổ tay từ vựng.',
})

// "Kiểm tra": multiple-choice recall quiz over the wordlist.
export default function Page() {
  return <QuizClient />
}
