import { WordlistReview } from './WordlistReview'

// Spaced-repetition review over the personal wordlist. The session is client-side
// (it reads/writes the authenticated user's own rows via the browser client).
export default function Page() {
  return <WordlistReview />
}
