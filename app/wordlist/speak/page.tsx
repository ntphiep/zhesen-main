import { SpeakSession } from './SpeakSession'

// "Luyện nói" (shadowing): listen to the word, say it back; the browser's speech
// recognition transcribes and grades the attempt. Needs Chrome/Edge + a microphone.
export default function Page() {
  return <SpeakSession />
}
