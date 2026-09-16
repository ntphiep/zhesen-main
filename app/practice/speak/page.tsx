import { SpeakSession } from '@/components/practice/SpeakSession'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Luyện nói',
  description: 'Đọc từ lên, máy nghe và so lại.',
})

// "Luyện nói" (shadowing): say the word back; the browser transcribes and grades it.
export default function Page() {
  return <SpeakSession />
}
