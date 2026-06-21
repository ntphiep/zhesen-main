import { QuizClient } from './QuizClient'

// Multiple-choice recall quiz over the personal wordlist. Runs client-side against
// the authenticated user's own words via the browser client.
export default function Page() {
  return <QuizClient />
}
