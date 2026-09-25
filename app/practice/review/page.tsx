import { WordlistReview } from '@/components/practice/WordlistReview'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Ôn từ',
  description: 'Ôn các từ đến hạn.',
})

// "Ôn từ": FSRS spaced-repetition review over due wordlist cards.
export default function Page() {
  return <WordlistReview />
}
