import { TypingSession } from '@/components/practice/TypingSession'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Viết từ',
  description: 'Nhìn nghĩa rồi gõ từ.',
})

// "Viết từ": show a Vietnamese meaning, type the English word.
export default function Page() {
  return <TypingSession mode="write" />
}
