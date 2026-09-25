import { SpeakSession } from '@/components/practice/SpeakSession'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Luyện nói',
  description: 'Đọc to từng từ để kiểm tra phát âm.',
})

// "Luyện nói" (shadowing): say the word back; the browser transcribes and grades it.
export default function Page() {
  return <SpeakSession />
}
