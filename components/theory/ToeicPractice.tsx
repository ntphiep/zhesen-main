'use client'
import { useEffect, useRef, useState } from 'react'
import s from './Theory.module.css'
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
      <div className={`${s.card} ${s.quiz} ${s.swap} text-center`}>
        <p ref={sentence} tabIndex={-1} className={s.score}>Kết quả: {score}/{questions.length}</p>
        <button
          type="button"
          onClick={() => { setIndex(0); setSelected(null); setScore(0) }}
          className={`${s.btn} mt-6`}
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
    if (i === q.answer) setScore((n) => n + 1)
  }

  return (
    <div className={`${s.card} ${s.quiz}`}>
      <div className={s.meta}>
        <span>Câu {index + 1}/{questions.length}</span>
        <span>{q.skillVi}</span>
      </div>
      <div className={s.bar} aria-hidden="true">
        <i style={{ transform: `scaleX(${(index + (answered ? 1 : 0)) / questions.length})` }} />
      </div>
      {/* Keyed by item, so each new sentence and its options rise in. */}
      <div key={q.id} className={s.swap}>
        <p ref={sentence} tabIndex={-1} className={s.stem} lang="en">{q.sentence}</p>

        <div className={s.options}>
          {q.options.map((opt, i) => {
            // Told apart by shape as well as fill: the right answer is filled with a check,
            // a wrong pick is dashed and struck through with a cross.
            const state = !answered ? undefined
              : i === q.answer ? 'right'
              : i === selected ? 'wrong'
              : 'rest'
            return (
              <button
                key={opt}
                type="button"
                disabled={answered}
                onClick={() => select(i)}
                data-state={state}
                className={s.option}
              >
                <b>({LETTERS[i]})</b><span lang="en">{opt}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* In words as well as colour, for a screen reader and for a colour-blind reader. */}
      {answered && (
        <div role="status" className={s.verdict}>
          <b>
            {selected === q.answer ? 'Đúng.' : `Sai. Đáp án (${LETTERS[q.answer]}) ${q.options[q.answer]}.`}
          </b>
          <p>{q.whyVi}</p>
          <p className={s.vi}>{q.vi}</p>
        </div>
      )}

      {answered && (
        <button
          type="button"
          onClick={() => { setIndex(index + 1); setSelected(null) }}
          className={`${s.btn} mt-5 w-full`}
        >
          Tiếp
        </button>
      )}
    </div>
  )
}
