import { TypingSession } from '@/components/practice/TypingSession'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Nghe và chép',
  description: 'Nghe phát âm rồi gõ lại từ.',
})

// "Nghe và chép": play the word's audio, type what you hear.
export default function Page() {
  return <TypingSession mode="dictation" />
}
