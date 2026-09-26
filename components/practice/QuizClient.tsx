'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { listPracticeWords } from '@/lib/wordlist/store'
import { useGradeSync } from '@/lib/hooks/useGradeSync'
import { GradeSyncWarning } from '@/components/practice/GradeSyncWarning'
import { gradeForMode } from '@/lib/practice/grading'
import { buildQuiz, type QuizQuestion } from '@/lib/practice/quiz'
import { QuizCard } from '@/components/practice/QuizCard'

const QUIZ_SIZE = 10

export function QuizClient() {
  const supabase = useMemo(() => createClient(), [])
  const { record: recordGrade, logDay, failed: syncFailed } = useGradeSync(supabase)
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null)
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [score, setScore] = useState(0)
  const [round, setRound] = useState(0) // bump to rebuild the quiz on "Làm lại"
  const logged = useRef(false)

  useEffect(() => {
    let active = true
    listPracticeWords(supabase, { needsMeaning: true })
      .then((words) => {
        if (!active) return
        const qs = buildQuiz(
          words.map((x) => ({ id: x.id, headword: x.headword, ipa: x.ipa, lang: x.lang, meaningVi: x.meaningVi })),
          QUIZ_SIZE,
        )
        setQuestions(qs)
        setIndex(0)
        setSelected(null)
        setScore(0)
      })
      .catch(() => active && setQuestions([]))
    return () => { active = false }
  }, [supabase, round])

  if (questions === null) return <main className="p-12 text-center text-black/50">Đang tải…</main>

  if (questions.length === 0) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <div className="text-xl font-semibold">Chưa đủ từ để kiểm tra</div>
        <p className="mt-2 text-black/50">Lưu thêm vài từ có nghĩa tiếng Việt.</p>
        <Link href="/practice" className="mt-6 inline-block rounded-lg bg-black px-5 py-2 text-white">Về luyện tập</Link>
      </main>
    )
  }

  const finished = index >= questions.length
  if (finished) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <div className="text-2xl font-semibold">Kết quả: {score}/{questions.length}</div>
        <GradeSyncWarning failed={syncFailed} />
        {score === questions.length && <p className="mt-2 text-black/50">Đúng hết.</p>}
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={() => setRound((r) => r + 1)} className="rounded-lg bg-black px-5 py-2 text-white">Làm lại</button>
          <Link href="/practice" className="rounded-lg border border-black/15 px-5 py-2 hover:bg-black/5">Về luyện tập</Link>
        </div>
      </main>
    )
  }

  const current = questions[index]

  function select(option: string) {
    if (selected !== null) return
    setSelected(option)
    const correct = option === current.answer
    if (correct) setScore((s) => s + 1)
    // The answer counts towards the word's schedule, but is not awaited: a slow write
    // must not hold up the next question, and the flashcard review stays the authority.
    recordGrade(current.id, gradeForMode('quiz', { correct }))
    if (!logged.current) { logged.current = true; logDay() }
  }
  function next() {
    setSelected(null)
    setIndex((i) => i + 1)
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <div className="mb-4 flex items-center justify-between text-sm text-black/50">
        <Link href="/practice" className="hover:underline">← Thoát</Link>
        <span>Câu {index + 1}/{questions.length} · Đúng {score}</span>
      </div>
      <QuizCard question={current} selected={selected} onSelect={select} onNext={next} />
    </main>
  )
}
