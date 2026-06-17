'use client'
import { useState } from 'react'
import type { QuizQuestion } from '@/lib/quiz/buildQuiz'

export function Quiz({ questions, onDone }: { questions: QuizQuestion[]; onDone: () => void }) {
  const [i, setI] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const q = questions[i]

  function choose(idx: number) {
    if (picked !== null) return
    setPicked(idx)
  }
  function next() {
    if (i + 1 >= questions.length) return onDone()
    setI(i + 1)
    setPicked(null)
  }

  return (
    <div>
      <div className="text-sm text-black/50">Câu {i + 1}/{questions.length}</div>
      <div className="mt-2 text-3xl font-semibold">{q.prompt}</div>
      {q.reading && <div className="text-black/50">{q.reading}</div>}
      <div className="mt-6 space-y-2">
        {q.options.map((opt, idx) => {
          const isAnswer = idx === q.answerIndex
          const show = picked !== null
          const cls = show
            ? isAnswer
              ? 'border-green-600 bg-green-50'
              : idx === picked
                ? 'border-red-500 bg-red-50'
                : 'border-black/10'
            : 'border-black/10 hover:bg-black/5'
          return (
            <button
              key={idx}
              onClick={() => choose(idx)}
              className={`block w-full rounded-lg border p-3 text-left ${cls}`}
            >
              {opt}
            </button>
          )
        })}
      </div>
      {picked !== null && (
        <button onClick={next} className="mt-6 rounded-lg bg-black px-5 py-2 text-white">
          {i + 1 >= questions.length ? 'Hoàn thành' : 'Tiếp'}
        </button>
      )}
    </div>
  )
}
