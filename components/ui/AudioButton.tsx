'use client'
import { useState } from 'react'
import type { LangCode } from '@/lib/languages'

export function speechLang(lang: LangCode): string {
  return { en: 'en-US', es: 'es-ES', zh: 'zh-CN' }[lang]
}

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

function pickVoice(voices: SpeechSynthesisVoice[], bcp47: string): SpeechSynthesisVoice | null {
  const base = bcp47.split('-')[0].toLowerCase()
  const norm = (l: string) => l.replace('_', '-').toLowerCase()
  return (
    voices.find((v) => norm(v.lang) === bcp47.toLowerCase()) ||
    voices.find((v) => norm(v.lang).startsWith(base)) ||
    null
  )
}

async function speakTts(text: string, bcp47: string, onEnd: () => void) {
  if (typeof speechSynthesis === 'undefined') return onEnd()
  const voices = await loadVoices()
  if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = bcp47
  const v = pickVoice(voices, bcp47)
  if (v) u.voice = v
  u.rate = 0.95
  u.onend = onEnd
  u.onerror = onEnd
  speechSynthesis.speak(u)
}

function canPlay(url: string): boolean {
  if (typeof Audio === 'undefined') return false
  // Safari/iOS cannot decode the Wikimedia .ogg/Vorbis files we have; skip to TTS.
  if (/\.ogg(\?|$)/i.test(url)) {
    try { return new Audio().canPlayType('audio/ogg; codecs="vorbis"') !== '' } catch { return false }
  }
  return true
}

/**
 * Pronunciation button. Prefers a playable recorded file; otherwise (and on any
 * playback failure) falls back to a hardened browser-TTS path with a real busy state.
 */
export function AudioButton({
  text, lang, audioUrl, accent,
}: { text: string; lang: LangCode; audioUrl?: string | null; accent?: string }) {
  const [busy, setBusy] = useState(false)
  const bcp47 = accent || speechLang(lang)

  function onClick() {
    if (busy) return
    setBusy(true)
    const end = () => setBusy(false)
    if (audioUrl && canPlay(audioUrl)) {
      const a = new Audio(audioUrl)
      a.crossOrigin = 'anonymous'
      a.onended = end
      a.onerror = () => void speakTts(text, bcp47, end)
      a.play().catch(() => void speakTts(text, bcp47, end))
    } else {
      void speakTts(text, bcp47, end)
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Phát âm ${text}`}
      aria-busy={busy}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-base hover:bg-black/10 ${busy ? 'opacity-60' : ''}`}
    >
      {busy ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-black/20 border-t-black/60" /> : '🔊'}
    </button>
  )
}
