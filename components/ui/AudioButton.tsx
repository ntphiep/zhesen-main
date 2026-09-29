'use client'
import { useState } from 'react'
import { speechLang, type LangCode } from '@/lib/languages'
import { commonsFilePage } from '@/lib/dictionary/pronunciation'

// Chrome/Edge return [] from getVoices() until the async 'voiceschanged' fires, so
// the first speak() of a session plays nothing. Resolve the list once and reuse it.
let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null
let probes = 0
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof speechSynthesis === 'undefined') return Promise.resolve([])
  if (voicesPromise) return voicesPromise
  probes++
  voicesPromise = new Promise<SpeechSynthesisVoice[]>((resolve) => {
    const ready = speechSynthesis.getVoices()
    if (ready.length) return resolve(ready)
    const onChange = () => resolve(speechSynthesis.getVoices())
    speechSynthesis.addEventListener('voiceschanged', onChange, { once: true })
    setTimeout(() => {
      // `once` only detaches on the event, which never fires where there are no
      // voices at all, so each probe would otherwise leave a listener behind.
      speechSynthesis.removeEventListener('voiceschanged', onChange)
      resolve(speechSynthesis.getVoices())
    }, 1000)
  }).then((voices) => {
    // An empty first list usually means the timeout won the race, not that the
    // machine is mute, so probe once more. A machine with no voices installed
    // answers empty forever, and re-probing on every click costs a second and a
    // listener each time for the same muted icon.
    if (!voices.length && probes < 2) voicesPromise = null
    return voices
  })
  return voicesPromise
}

/** Exported for tests only. */
export function resetVoiceCache() {
  voicesPromise = null
  probes = 0
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
 * A wrong-language voice teaches a pronunciation that does not exist, and an
 * utterance on a voiceless machine is silence, so check for a voice first.
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

const TONES = {
  icon: 'h-8 w-8 text-black/60 hover:bg-black/10 hover:text-black',
  pane: 'h-10 gap-1.5 border-[1.5px] border-current px-4 text-sm font-bold hover:bg-current/10',
  chip: 'h-9 gap-1.5 bg-(--sea-50) px-3.5 text-sm font-bold text-(--sea-700) hover:bg-(--sea-100)',
}

const NO_VOICE: Record<LangCode, string> = {
  zh: 'Máy chưa cài giọng đọc tiếng Trung',
  es: 'Máy chưa cài giọng đọc tiếng Tây Ban Nha',
  en: 'Máy chưa cài giọng đọc tiếng Anh',
}

/**
 * Pronunciation button: a recorded file when there is one, browser speech synthesis
 * otherwise and on any playback failure. It says so when the browser has no voice
 * for the language; the Chinese entries carry no recordings at all.
 *
 * A `tone` draws the landing page's labelled pill instead of the bare icon: `pane` on a
 * coloured lane, `chip` on a card.
 */
export function AudioButton({
  text, lang, audioUrl, accent, label, tone,
}: { text: string; lang: LangCode; audioUrl?: string | null; accent?: string; label?: string; tone?: 'pane' | 'chip' }) {
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

  // The reason rides on the icon and the label, not on text beside the button: this
  // sits in a wordlist table cell, where anything wider pushes the column out.
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={noVoice ? NO_VOICE[lang] : (label ?? `Phát âm ${text}`)}
      aria-busy={busy}
      title={noVoice ? NO_VOICE[lang] : undefined}
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${TONES[tone ?? 'icon']} ${busy ? 'opacity-60' : ''} ${noVoice ? 'opacity-40' : ''}`}
    >
      {busy
        ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-black/20 border-t-black/60" />
        : (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H2v6h4l5 4V5z" />
            {noVoice ? <path d="m22 9-6 6m0-6 6 6" /> : <><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a10 10 0 0 1 0 14" /></>}
          </svg>
        )}
      {tone && <span>{label}</span>}
    </button>
  )
}

/** Link to a recording's Wikimedia Commons file page, which names the author and licence
 *  that CC BY-SA 4.0 section 3(a)(2) lets a link carry. Nothing for TTS or another host. */
export function SourceLink({ url }: { url: string | null }) {
  const page = commonsFilePage(url)
  if (!page) return null
  return (
    <a
      href={page}
      target="_blank"
      rel="noopener noreferrer"
      title="Tác giả và giấy phép của bản ghi"
      className="text-[0.7rem] text-black/60 hover:underline"
    >
      nguồn
    </a>
  )
}
