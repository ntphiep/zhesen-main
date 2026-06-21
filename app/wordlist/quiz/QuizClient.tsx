'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { listWords } from '@/lib/wordlist/store'
import { buildQuiz, type QuizQuestion } from '@/lib/wordlist/quiz'
import { QuizCard } from '@/components/wordlist/QuizCard'

const QUIZ_SIZE = 10

export function QuizClient() {
  const supabase = useMemo(() => createClient(), [])
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null)
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [score, setScore] = useState(0)
  const [round, setRound] = useState(0) // bump to rebuild the quiz on "Làm lại"

  useEffect(() => {
    let active = true
    listWords(supabase)
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
        <p className="mt-2 text-black/50">Hãy thêm vài từ có nghĩa tiếng Việt vào sổ tay trước.</p>
        <Link href="/wordlist" className="mt-6 inline-block rounded-lg bg-black px-5 py-2 text-white">Về sổ tay</Link>
      </main>
    )
  }

  const finished = index >= questions.length
  if (finished) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <div className="text-2xl font-semibold">Kết quả: {score}/{questions.length}</div>
        <p className="mt-2 text-black/50">{score === questions.length ? 'Tuyệt vời! 🎉' : 'Tiếp tục luyện nhé.'}</p>
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={() => setRound((r) => r + 1)} className="rounded-lg bg-black px-5 py-2 text-white">Làm lại</button>
          <Link href="/wordlist" className="rounded-lg border border-black/15 px-5 py-2 hover:bg-black/5">Về sổ tay</Link>
        </div>
      </main>
    )
  }

  const current = questions[index]

  function select(option: string) {
    if (selected !== null) return
    setSelected(option)
    if (option === current.answer) setScore((s) => s + 1)
  }
  function next() {
    setSelected(null)
    setIndex((i) => i + 1)
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <div className="mb-4 flex items-center justify-between text-sm text-black/50">
        <Link href="/wordlist" className="hover:underline">← Thoát</Link>
        <span>Câu {index + 1}/{questions.length} · Đúng {score}</span>
      </div>
      <QuizCard question={current} selected={selected} onSelect={select} onNext={next} />
    </main>
  )
}
