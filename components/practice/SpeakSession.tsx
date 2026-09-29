'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { listPracticeWords } from '@/lib/wordlist/store'
import { AudioButton, SourceLink } from '@/components/ui/AudioButton'
import { checkTypedAnswer, type TypedResult } from '@/lib/practice/typing'
import { shuffle } from '@/lib/practice/shuffle'
import { useGradeSync } from '@/lib/hooks/useGradeSync'
import { GradeSyncWarning } from '@/components/practice/GradeSyncWarning'
import { gradeForMode } from '@/lib/practice/grading'
import { speechLang, type LangCode } from '@/lib/languages'
import { getRecognitionCtor, type SpeechRecognitionLike } from '@/lib/practice/recognition'

const SIZE = 10

/** Recogniser error codes worth explaining. Anything else falls back to one line. */
const RECOGNITION_ERRORS: Record<string, string> = {
  'not-allowed': 'Trình duyệt đang chặn micro. Cho phép micro rồi thử lại.',
  'service-not-allowed': 'Trình duyệt đang chặn micro. Cho phép micro rồi thử lại.',
  'audio-capture': 'Không tìm thấy micro. Kiểm tra micro rồi thử lại.',
  'no-speech': 'Chưa nghe thấy gì. Bấm Nói rồi đọc to hơn.',
  network: 'Trình duyệt mất kết nối tới bộ nhận giọng nói. Thử lại sau ít giây.',
}

interface SpeakWord { id: string; headword: string; meaningVi: string | null; audioUrl: string | null; lang: LangCode }

export function SpeakSession() {
  const supabase = useMemo(() => createClient(), [])
  const { record: recordGrade, logDay, failed: syncFailed } = useGradeSync(supabase)
  const supported = useMemo(() => getRecognitionCtor() !== null, [])
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const logged = useRef(false)
  const [queue, setQueue] = useState<SpeakWord[] | null>(null)
  const [index, setIndex] = useState(0)
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState<string | null>(null)
  const [result, setResult] = useState<TypedResult | null>(null)
  const [micError, setMicError] = useState<string | null>(null)
  const [score, setScore] = useState(0)
  const [round, setRound] = useState(0)

  useEffect(() => {
    let active = true
    listPracticeWords(supabase)
      .then((words) => {
        if (!active) return
        const usable = words
          .filter((w) => w.headword)
          .map((w): SpeakWord => ({ id: w.id, headword: w.headword, meaningVi: w.meaningVi, audioUrl: w.audioUrl, lang: w.lang }))
        setQueue(shuffle(usable).slice(0, SIZE))
        setIndex(0); setHeard(null); setResult(null); setScore(0); setListening(false); setMicError(null)
      })
      .catch(() => active && setQueue([]))
    return () => { active = false; recognitionRef.current?.stop() }
  }, [supabase, round])

  if (queue === null) return <main className="p-12 text-center text-black/55">Đang tải…</main>

  if (!supported) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <div className="text-xl font-semibold">Trình duyệt chưa hỗ trợ luyện nói</div>
        <p className="mt-2 text-black/55">Mở trang này bằng Chrome hoặc Edge trên máy tính.</p>
        <Link href="/practice" className="mt-6 inline-block rounded-lg bg-black px-5 py-2 text-white">Về luyện tập</Link>
      </main>
    )
  }

  if (queue.length === 0) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <div className="text-xl font-semibold">Chưa đủ từ để luyện</div>
        <Link href="/practice" className="mt-6 inline-block rounded-lg bg-black px-5 py-2 text-white">Về luyện tập</Link>
      </main>
    )
  }

  if (index >= queue.length) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <div className="text-2xl font-semibold">Kết quả: {score}/{queue.length}</div>
        <GradeSyncWarning failed={syncFailed} />
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={() => setRound((r) => r + 1)} className="rounded-lg bg-black px-5 py-2 text-white">Làm lại</button>
          <Link href="/practice" className="rounded-lg border border-black/15 px-5 py-2 hover:bg-black/5">Về luyện tập</Link>
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
      // Successes count towards the schedule, failures do not: the recogniser mishears
      // for reasons that are not the learner's, so `gradeForMode` returns null there.
      recordGrade(current.id, gradeForMode('speak', { correct: verdict !== 'wrong', nearly: verdict === 'close' }))
      if (!logged.current) { logged.current = true; logDay() }
    }
    // Without a message the button flips straight back to "🎤 Nói" and a blocked
    // microphone never says so.
    r.onerror = (e) => {
      setListening(false)
      setMicError(RECOGNITION_ERRORS[e.error ?? ''] ?? 'Chưa nghe rõ. Thử lại.')
    }
    r.onend = () => setListening(false)
    setHeard(null); setResult(null); setMicError(null); setListening(true)
    r.start()
  }
  function next() {
    setHeard(null); setResult(null); setMicError(null); setListening(false); setIndex((i) => i + 1)
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <div className="mb-4 flex items-center justify-between text-sm text-black/55">
        <Link href="/practice" className="hover:underline">← Thoát</Link>
        <span>Luyện nói · {index + 1}/{queue.length} · Đúng {score}</span>
      </div>

      <div className="rounded-2xl border border-black/10 p-8 text-center">
        <div className="flex items-center justify-center gap-2">
          <span className="text-3xl font-semibold">{current.headword}</span>
          <AudioButton text={current.headword} lang={current.lang} audioUrl={current.audioUrl} />
          <SourceLink url={current.audioUrl} />
        </div>
        {current.meaningVi && <div className="mt-1 text-black/55">{current.meaningVi}</div>}
        <p className="mt-2 text-sm text-black/55">Nghe mẫu rồi đọc lại</p>

        {result === null && (
          <button
            onClick={listen}
            disabled={listening}
            className={`mt-6 w-full rounded-lg py-3 text-white ${listening ? 'bg-rose-500' : 'bg-black'}`}
          >
            {listening ? 'Đang nghe…' : '🎤 Nói'}
          </button>
        )}
        {result === null && micError && (
          <p role="status" aria-live="polite" className="mt-3 text-sm text-rose-700">{micError}</p>
        )}
        {result !== null && (
          <div role="status" aria-live="polite" className="mt-6">
            {result === 'correct' && <p className="font-medium text-emerald-700">Đúng</p>}
            {result === 'close' && <p className="font-medium text-amber-700">Gần đúng</p>}
            {result === 'wrong' && <p className="font-medium text-rose-700">Chưa khớp. Thử lại sau.</p>}
            {heard && <p className="mt-1 text-sm text-black/55">Nghe được: “{heard}”</p>}
            <button onClick={next} className="mt-4 w-full rounded-lg bg-black py-2 text-white">Tiếp</button>
          </div>
        )}
      </div>
    </main>
  )
}
