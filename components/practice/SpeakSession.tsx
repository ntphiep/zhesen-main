'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { listPracticeWords } from '@/lib/wordlist/store'
import { AudioButton, SourceLink } from '@/components/ui/AudioButton'
import { checkTypedAnswer, type TypedResult } from '@/lib/practice/typing'
import { shuffle } from '@/lib/practice/shuffle'
import { useGradeSync } from '@/lib/hooks/useGradeSync'
import { gradeForMode } from '@/lib/practice/grading'
import { speechLang, type LangCode } from '@/lib/languages'
import { getRecognitionCtor, type SpeechRecognitionLike } from '@/lib/practice/recognition'
import { ErrorLine } from '@/components/search/ErrorLine'
import { Empty, Hw, Loading, MIC, Result, SessionBar, Stage, Verdict } from '@/components/practice/SessionParts'
import p from './Practice.module.css'

const SIZE = 10

/** Recogniser error codes worth explaining. Anything else falls back to one line. */
const RECOGNITION_ERRORS: Record<string, string> = {
  'not-allowed': 'Trình duyệt đang chặn micro. Cho phép micro rồi thử lại.',
  'service-not-allowed': 'Trình duyệt đang chặn micro. Cho phép micro rồi thử lại.',
  'audio-capture': 'Không tìm thấy micro. Kiểm tra micro rồi thử lại.',
  'no-speech': 'Chưa nghe thấy gì. Bấm Nói rồi đọc to hơn.',
  network: 'Trình duyệt mất kết nối tới bộ nhận giọng nói. Thử lại sau ít giây.',
}

interface SpeakWord { id: string; headword: string; meaningVi: string; audioUrl: string | null; lang: LangCode }

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
  // Saying a word already on screen is reading, not recall: only an answer given before the
  // word is shown is graded.
  const [revealed, setRevealed] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const [score, setScore] = useState(0)
  const [round, setRound] = useState(0)

  useEffect(() => {
    let active = true
    listPracticeWords(supabase, { needsMeaning: true })
      .then((words) => {
        if (!active) return
        const usable = words.flatMap((w): SpeakWord[] => w.headword && w.meaningVi
          ? [{ id: w.id, headword: w.headword, meaningVi: w.meaningVi, audioUrl: w.audioUrl, lang: w.lang }]
          : [])
        setQueue(shuffle(usable).slice(0, SIZE))
        setIndex(0); setHeard(null); setResult(null); setRevealed(false); setScore(0); setListening(false); setMicError(null)
      })
      .catch(() => active && setQueue([]))
    return () => { active = false; recognitionRef.current?.stop() }
  }, [supabase, round])

  if (queue === null) return <Loading />

  if (!supported) return <Empty title="Trình duyệt chưa hỗ trợ luyện nói" note="Mở trang này bằng Chrome hoặc Edge trên máy tính." />

  if (queue.length === 0) return <Empty title="Chưa đủ từ để luyện" />

  if (index >= queue.length) {
    return <Result score={score} total={queue.length} failed={syncFailed} onAgain={() => setRound((r) => r + 1)} />
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
      const verdict = checkTypedAnswer(transcript, current.headword, { lang: current.lang, foldAccents: true })
      setHeard(transcript)
      setResult(verdict)
      // Successes count towards the schedule, failures do not: the recogniser mishears
      // for reasons that are not the learner's, so `gradeForMode` returns null there.
      if (!revealed) {
        if (verdict !== 'wrong') setScore((s) => s + 1)
        recordGrade(current.id, 'speak', gradeForMode('speak', { correct: verdict !== 'wrong', nearly: verdict === 'close' }))
      }
      if (!logged.current) { logged.current = true; logDay() }
    }
    // Without a message the button flips straight back to "Nói" and a blocked
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
    setHeard(null); setResult(null); setRevealed(false); setMicError(null); setListening(false); setIndex((i) => i + 1)
  }

  return (
    <Stage>
      <SessionBar label={`Luyện nói · ${index + 1}/${queue.length} · Đúng ${score}`} done={index + (result === null ? 0 : 1)} total={queue.length} />

      <div key={index} className={p.card}>
        <p className={p.meta}>Nghĩa</p>
        <div className={`${p.mid} mt-2`}>{current.meaningVi}</div>
        {revealed || result !== null ? (
          <div className={`${p.head} mt-2`}>
            <Hw text={current.headword} lang={current.lang} className={p.big} />
            <AudioButton text={current.headword} lang={current.lang} audioUrl={current.audioUrl} />
            <span className={p.src}><SourceLink url={current.audioUrl} /></span>
          </div>
        ) : (
          <button type="button" onClick={() => setRevealed(true)} className={`${p.ghost} mt-3`}>Hiện từ</button>
        )}
        <p className={p.ask}>{revealed || result !== null ? 'Nghe mẫu rồi đọc lại' : 'Nói từ có nghĩa này'}</p>

        {result === null && (
          <button type="button" onClick={listen} disabled={listening} data-on={listening || undefined} className={p.mic}>
            {MIC}
            {listening ? 'Đang nghe…' : 'Nói'}
          </button>
        )}
        {result === null && micError && (
          <div role="status" aria-live="polite" className="mt-3 flex justify-center"><ErrorLine>{micError}</ErrorLine></div>
        )}
        {result !== null && (
          <div role="status" aria-live="polite">
            {result === 'correct' && <Verdict result="correct">Đúng</Verdict>}
            {result === 'close' && <Verdict result="close">Gần đúng</Verdict>}
            {result === 'wrong' && <Verdict result="wrong">Chưa khớp. Thử lại sau.</Verdict>}
            {heard && <p className={p.heard}>Nghe được: “{heard}”</p>}
            <button type="button" onClick={next} className={`${p.btn} ${p.wide}`}>Tiếp</button>
          </div>
        )}
      </div>
    </Stage>
  )
}
