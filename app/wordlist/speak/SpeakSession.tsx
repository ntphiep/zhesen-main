'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { listWords } from '@/lib/wordlist/store'
import { AudioButton, speechLang } from '@/components/AudioButton'
import { checkTypedAnswer, type TypedResult } from '@/lib/wordlist/typing'
import type { LangCode } from '@/lib/content/types'

const SIZE = 10

// Minimal shape of the Web Speech API we use (not in the TS DOM lib).
interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void
  onerror: () => void
  onend: () => void
  start: () => void
  stop: () => void
}
function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

interface SpeakWord { headword: string; meaningVi: string | null; audioUrl: string | null; lang: LangCode }

function shuffle<T>(input: T[]): T[] {
  const a = [...input]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function SpeakSession() {
  const supabase = useMemo(() => createClient(), [])
  const supported = useMemo(() => getRecognitionCtor() !== null, [])
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const [queue, setQueue] = useState<SpeakWord[] | null>(null)
  const [index, setIndex] = useState(0)
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState<string | null>(null)
  const [result, setResult] = useState<TypedResult | null>(null)
  const [score, setScore] = useState(0)
  const [round, setRound] = useState(0)

  useEffect(() => {
    let active = true
    listWords(supabase)
      .then((words) => {
        if (!active) return
        const usable = words
          .filter((w) => w.headword)
          .map((w): SpeakWord => ({ headword: w.headword, meaningVi: w.meaningVi, audioUrl: w.audioUrl, lang: w.lang }))
        setQueue(shuffle(usable).slice(0, SIZE))
        setIndex(0); setHeard(null); setResult(null); setScore(0); setListening(false)
      })
      .catch(() => active && setQueue([]))
    return () => { active = false; recognitionRef.current?.stop() }
  }, [supabase, round])

  if (queue === null) return <main className="p-12 text-center text-black/50">Đang tải…</main>

  if (!supported) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <div className="text-xl font-semibold">Trình duyệt chưa hỗ trợ luyện nói</div>
        <p className="mt-2 text-black/50">Tính năng nhận diện giọng nói cần Chrome hoặc Edge trên máy tính (và quyền micro).</p>
        <Link href="/wordlist" className="mt-6 inline-block rounded-lg bg-black px-5 py-2 text-white">Về sổ tay</Link>
      </main>
    )
  }

  if (queue.length === 0) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <div className="text-xl font-semibold">Chưa đủ từ để luyện</div>
        <Link href="/wordlist" className="mt-6 inline-block rounded-lg bg-black px-5 py-2 text-white">Về sổ tay</Link>
      </main>
    )
  }

  if (index >= queue.length) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <div className="text-2xl font-semibold">Kết quả: {score}/{queue.length}</div>
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={() => setRound((r) => r + 1)} className="rounded-lg bg-black px-5 py-2 text-white">Làm lại</button>
          <Link href="/wordlist" className="rounded-lg border border-black/15 px-5 py-2 hover:bg-black/5">Về sổ tay</Link>
        </div>
      </main>
    )
  }

  const current = queue[index]

  function listen() {
    const Ctor = getRecognitionCtor()
    if (!Ctor || listening) return
    const r = new Ctor()
    recognitionRef.current = r
    r.lang = speechLang(current.lang)
    r.interimResults = false
    r.maxAlternatives = 1
    r.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript ?? ''
      const verdict = checkTypedAnswer(transcript, current.headword)
      setHeard(transcript)
      setResult(verdict)
      if (verdict !== 'wrong') setScore((s) => s + 1)
    }
    r.onerror = () => setListening(false)
    r.onend = () => setListening(false)
    setHeard(null); setResult(null); setListening(true)
    r.start()
  }
  function next() {
    setHeard(null); setResult(null); setListening(false); setIndex((i) => i + 1)
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <div className="mb-4 flex items-center justify-between text-sm text-black/50">
        <Link href="/wordlist" className="hover:underline">← Thoát</Link>
        <span>Luyện nói · {index + 1}/{queue.length} · Đúng {score}</span>
      </div>

      <div className="rounded-2xl border border-black/10 p-8 text-center">
        <div className="flex items-center justify-center gap-2">
          <span className="text-3xl font-semibold">{current.headword}</span>
          <AudioButton text={current.headword} lang={current.lang} audioUrl={current.audioUrl} />
        </div>
        {current.meaningVi && <div className="mt-1 text-black/50">{current.meaningVi}</div>}
        <p className="mt-2 text-sm text-black/40">Nghe mẫu rồi đọc lại từ này</p>

        {result === null ? (
          <button
            onClick={listen}
            disabled={listening}
            className={`mt-6 w-full rounded-lg py-3 text-white ${listening ? 'bg-rose-500' : 'bg-black'}`}
          >
            {listening ? 'Đang nghe… nói đi!' : '🎤 Nói'}
          </button>
        ) : (
          <div className="mt-6">
            {result === 'correct' && <p className="font-medium text-emerald-700">Chính xác ✓</p>}
            {result === 'close' && <p className="font-medium text-amber-700">Gần đúng</p>}
            {result === 'wrong' && <p className="font-medium text-rose-700">Chưa khớp, thử lại sau nhé</p>}
            {heard && <p className="mt-1 text-sm text-black/50">Nghe được: “{heard}”</p>}
            <button onClick={next} className="mt-4 w-full rounded-lg bg-black py-2 text-white">Tiếp</button>
          </div>
        )}
      </div>
    </main>
  )
}
