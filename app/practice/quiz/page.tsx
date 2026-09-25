import { QuizClient } from '@/components/practice/QuizClient'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Kiểm tra',
  description: 'Chọn nghĩa đúng trong bốn đáp án.',
})

// "Kiểm tra": multiple-choice recall quiz over the wordlist.
export default function Page() {
  return <QuizClient />
}
