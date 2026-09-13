'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { listPracticeWords } from '@/lib/wordlist/store'
import { logActivityDay } from '@/lib/wordlist/activity'
import { shuffle } from '@/lib/practice/shuffle'
import { useGradeSync } from '@/lib/hooks/useGradeSync'
import { GradeSyncWarning } from '@/components/practice/GradeSyncWarning'
import { gradeForMode } from '@/lib/practice/grading'
import { checkTypedAnswer, type TypedResult } from '@/lib/practice/typing'
import { TypingCard, type TypingPrompt } from '@/components/practice/TypingCard'

const SIZE = 10

export function TypingSession({ mode }: { mode: 'write' | 'dictation' }) {
  const supabase = useMemo(() => createClient(), [])
  const { record: recordGrade, failed: syncFailed } = useGradeSync(supabase)
  const [queue, setQueue] = useState<TypingPrompt[] | null>(null)
  const [index, setIndex] = useState(0)
  const [value, setValue] = useState('')
  const [result, setResult] = useState<TypedResult | null>(null)
  const [score, setScore] = useState(0)
  const [round, setRound] = useState(0)
  const logged = useRef(false)

  useEffect(() => {
    let active = true
    listPracticeWords(supabase)
      .then((words) => {
        if (!active) return
        const usable = words
          .filter((w) => w.headword && (mode === 'dictation' || (w.meaningVi && w.meaningVi.trim())))
          .map((w): TypingPrompt => ({ id: w.id, headword: w.headword, meaningVi: w.meaningVi, ipa: w.ipa, audioUrl: w.audioUrl, lang: w.lang }))
        setQueue(shuffle(usable).slice(0, SIZE))
        setIndex(0); setValue(''); setResult(null); setScore(0)
      })
      .catch(() => active && setQueue([]))
    return () => { active = false }
  }, [supabase, mode, round])

  if (queue === null) return <main className="p-12 text-center text-black/50">Đang tải…</main>

  if (queue.length === 0) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <div className="text-xl font-semibold">Chưa đủ từ để luyện</div>
        <p className="mt-2 text-black/50">Thêm vài từ vào sổ tay trước nhé.</p>
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
  const title = mode === 'write' ? 'Viết từ' : 'Nghe & chép'

  function submit() {
    if (result !== null) return
    const r = checkTypedAnswer(value, current.headword)
    setResult(r)
    if (r !== 'wrong') setScore((s) => s + 1)
    // A one-character typo counts as a hard recall, not a clean one: the learner
    // produced the word, which is more than the quiz can tell.
    recordGrade(current.id, gradeForMode(mode, { correct: r !== 'wrong', nearly: r === 'close' }))
    if (!logged.current) { logged.current = true; void logActivityDay(supabase) }
  }
  function next() {
    setResult(null); setValue(''); setIndex((i) => i + 1)
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <div className="mb-4 flex items-center justify-between text-sm text-black/50">
        <Link href="/practice" className="hover:underline">← Thoát</Link>
        <span>{title} · {index + 1}/{queue.length} · Đúng {score}</span>
      </div>
      <TypingCard
        mode={mode}
        word={current}
        value={value}
        result={result}
        onChange={setValue}
        onSubmit={submit}
        onNext={next}
      />
    </main>
  )
}
