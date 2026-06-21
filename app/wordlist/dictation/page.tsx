import { TypingSession } from '@/components/wordlist/TypingSession'

// "Nghe & chép": play the word's audio (or TTS), type what you hear (listening + spelling).
export default function Page() {
  return <TypingSession mode="dictation" />
}
