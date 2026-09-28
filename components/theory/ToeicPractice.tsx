'use client'
import { useEffect, useRef, useState } from 'react'
import type { ToeicQuestion } from '@/lib/theory/types'

const LETTERS = ['A', 'B', 'C', 'D']

/** A Part 5 set, one item at a time, in test order. Nothing is saved: the items are not
 *  words in the notebook, so they have no schedule to write to. */
export function ToeicPractice({ questions }: { questions: readonly ToeicQuestion[] }) {
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const sentence = useRef<HTMLParagraphElement>(null)
  const shown = useRef(index)

  // "Tiếp" unmounts the button that had focus, so move it to the new sentence or the
  // result. Only on a change of item: focusing on mount scrolls the page down to the set.
  useEffect(() => {
    if (shown.current !== index) sentence.current?.focus()
    shown.current = index
  }, [index])

  if (index >= questions.length) {
    return (
      <div className="rounded-2xl border border-black/10 p-8 text-center">
        <p ref={sentence} tabIndex={-1} className="text-2xl font-semibold outline-none">Kết quả: {score}/{questions.length}</p>
        <button
          type="button"
          onClick={() => { setIndex(0); setSelected(null); setScore(0) }}
          className="mt-6 rounded-lg bg-black px-5 py-2 text-white"
        >
          Làm lại
        </button>
      </div>
    )
  }

  const q = questions[index]
  const answered = selected !== null

  function select(i: number) {
    if (answered) return
    setSelected(i)
    if (i === q.answer) setScore((s) => s + 1)
  }

  return (
    <div className="rounded-2xl border border-black/10 p-6">
      <div className="flex items-baseline justify-between text-sm text-black/55">
        <span>Câu {index + 1}/{questions.length}</span>
        <span>{q.skillVi}</span>
      </div>
      <p ref={sentence} tabIndex={-1} className="mt-3 text-lg outline-none">{q.sentence}</p>

      <div className="mt-5 flex flex-col gap-2">
        {q.options.map((opt, i) => {
          let cls = 'border-black/10 hover:bg-black/5'
          if (answered) {
            if (i === q.answer) cls = 'border-emerald-300 bg-emerald-50 text-emerald-800'
            else if (i === selected) cls = 'border-rose-300 bg-rose-50 text-rose-800'
            else cls = 'border-black/10 opacity-60'
          }
          return (
            <button
              key={opt}
              type="button"
              disabled={answered}
              onClick={() => select(i)}
              className={`rounded-lg border px-4 py-3 text-left transition ${cls}`}
            >
              <span className="mr-2 text-black/55">({LETTERS[i]})</span>{opt}
            </button>
          )
        })}
      </div>

      {/* In words as well as colour, for a screen reader and for a colour-blind reader. */}
      {answered && (
        <div role="status" className="mt-5 rounded-xl bg-black/5 px-4 py-3 text-sm">
          <p className="font-semibold">
            {selected === q.answer ? 'Đúng.' : `Sai. Đáp án (${LETTERS[q.answer]}) ${q.options[q.answer]}.`}
          </p>
          <p className="mt-1 text-black/80">{q.whyVi}</p>
          <p className="mt-1 text-black/55">{q.vi}</p>
        </div>
      )}

      {answered && (
        <button
          type="button"
          onClick={() => { setIndex(index + 1); setSelected(null) }}
          className="mt-5 w-full rounded-lg bg-black py-2 text-white"
        >
          Tiếp
        </button>
      )}
    </div>
  )
}
