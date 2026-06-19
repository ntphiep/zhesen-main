'use client'
import { useState } from 'react'
import type { LangCode } from '@/lib/content/types'

export function speechLang(lang: LangCode): string {
  return { en: 'en-US', es: 'es-ES', zh: 'zh-CN' }[lang]
}

function speak(text: string, lang: LangCode) {
  if (typeof speechSynthesis === 'undefined') return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = speechLang(lang)
  speechSynthesis.speak(u)
}

export function AudioButton({ text, lang, audioUrl }: { text: string; lang: LangCode; audioUrl?: string | null }) {
  const [playing, setPlaying] = useState(false)
  async function onClick() {
    setPlaying(true)
    try {
      if (audioUrl) {
        await new Audio(audioUrl).play()
      } else {
        speak(text, lang)
      }
    } catch {
      speak(text, lang)
    } finally {
      setPlaying(false)
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Phát âm ${text}`}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/10 ${playing ? 'opacity-50' : ''}`}
    >
      🔊
    </button>
  )
}
