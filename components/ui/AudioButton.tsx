'use client'
import { useState } from 'react'
import { speechLang, type LangCode } from '@/lib/languages'

// Chrome/Edge return [] from getVoices() until the async 'voiceschanged' fires, so a
// speak() on the first interaction of a session silently plays nothing. Resolve the
// voice list once and reuse it.
let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof speechSynthesis === 'undefined') return Promise.resolve([])
  if (voicesPromise) return voicesPromise
  voicesPromise = new Promise((resolve) => {
    const ready = speechSynthesis.getVoices()
    if (ready.length) return resolve(ready)
    const onChange = () => resolve(speechSynthesis.getVoices())
    speechSynthesis.addEventListener('voiceschanged', onChange, { once: true })
    setTimeout(() => resolve(speechSynthesis.getVoices()), 1000)
  })
  return voicesPromise
}

/** Exported for tests only. */
export function resetVoiceCache() {
  voicesPromise = null
}

function pickVoice(voices: SpeechSynthesisVoice[], bcp47: string): SpeechSynthesisVoice | null {
  const base = bcp47.split('-')[0].toLowerCase()
  const norm = (l: string) => l.replace('_', '-').toLowerCase()
  return (
    voices.find((v) => norm(v.lang) === bcp47.toLowerCase()) ||
    voices.find((v) => norm(v.lang).startsWith(base)) ||
    null
  )
}

/**
 * Speak `text`, returning false when the machine has no voice for the language.
 *
 * Speaking with the wrong voice is worse than not speaking: a Chinese word read
 * by an English voice teaches a pronunciation that does not exist. Playing the
 * utterance on a voiceless machine produces silence, indistinguishable to the
 * reader from a broken speaker, so this checks for a voice first.
 */
async function speakTts(text: string, bcp47: string, onEnd: () => void): Promise<boolean> {
  if (typeof speechSynthesis === 'undefined') {
    onEnd()
    return false
  }
  const voices = await loadVoices()
  const v = pickVoice(voices, bcp47)
  if (!v) {
    onEnd()
    return false
  }
  if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = bcp47
  u.voice = v
  u.rate = 0.95
  u.onend = onEnd
  u.onerror = onEnd
  speechSynthesis.speak(u)
  return true
}

function canPlay(url: string): boolean {
  if (typeof Audio === 'undefined') return false
  // Safari/iOS cannot decode the Wikimedia .ogg/Vorbis files we have; skip to TTS.
  if (/\.ogg(\?|$)/i.test(url)) {
    try { return new Audio().canPlayType('audio/ogg; codecs="vorbis"') !== '' } catch { return false }
  }
  return true
}

const NO_VOICE: Record<LangCode, string> = {
  zh: 'Máy chưa cài giọng đọc tiếng Trung',
  es: 'Máy chưa cài giọng đọc tiếng Tây Ban Nha',
  en: 'Máy chưa cài giọng đọc tiếng Anh',
}

/**
 * Pronunciation button. Prefers a recorded file; otherwise (and on any playback
 * failure) falls back to browser speech synthesis. When the browser has no voice
 * for the language it says so instead of failing quietly -- the Chinese entries
 * carry no recordings at all, so on a machine without a Chinese voice this button
 * was simply dead.
 */
export function AudioButton({
  text, lang, audioUrl, accent,
}: { text: string; lang: LangCode; audioUrl?: string | null; accent?: string }) {
  const [busy, setBusy] = useState(false)
  const [noVoice, setNoVoice] = useState(false)
  const bcp47 = accent || speechLang(lang)

  function onClick() {
    if (busy) return
    setBusy(true)
    const end = () => setBusy(false)
    const speak = () => void speakTts(text, bcp47, end).then((ok) => setNoVoice(!ok))
    if (audioUrl && canPlay(audioUrl)) {
      const a = new Audio(audioUrl)
      a.crossOrigin = 'anonymous'
      a.onended = end
      a.onerror = speak
      a.play().catch(speak)
    } else {
      speak()
    }
  }

  // The reason is carried by the icon and the label rather than by text beside the
  // button: this button sits in a table cell in the wordlist, and anything wider
  // than the button itself would push the column out.
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={noVoice ? NO_VOICE[lang] : `Phát âm ${text}`}
      aria-busy={busy}
      title={noVoice ? NO_VOICE[lang] : undefined}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-base hover:bg-black/10 ${busy ? 'opacity-60' : ''} ${noVoice ? 'opacity-40' : ''}`}
    >
      {busy
        ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-black/20 border-t-black/60" />
        : (noVoice ? '🔇' : '🔊')}
    </button>
  )
}
