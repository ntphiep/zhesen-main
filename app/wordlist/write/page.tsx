import { TypingSession } from '@/components/wordlist/TypingSession'

// "Viết từ": show a Vietnamese meaning, type the English word (production recall).
export default function Page() {
  return <TypingSession mode="write" />
}
