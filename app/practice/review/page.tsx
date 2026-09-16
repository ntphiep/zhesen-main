import { WordlistReview } from '@/components/practice/WordlistReview'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Ôn tập',
  description: 'Lặp lại ngắt quãng theo lịch FSRS.',
})

// "Ôn tập": SM-2 spaced-repetition review over due wordlist cards.
export default function Page() {
  return <WordlistReview />
}
