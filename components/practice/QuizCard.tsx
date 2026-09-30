'use client'
import { useEffect, useRef } from 'react'
import { AudioButton } from '@/components/ui/AudioButton'
import type { QuizQuestion } from '@/lib/practice/quiz'
import { Ipa } from '@/components/ui/Ipa'
import { CHECK, CROSS, Hw } from '@/components/practice/SessionParts'
import { holdBack, onlyKey } from '@/components/practice/keys'
import { useKeyGate } from '@/lib/hooks/useKeyGate'
import p from './Practice.module.css'

/** One multiple-choice question. Once `selected` is set, options lock: the answer fills
 * blue with a tick, a wrong pick is outlined, struck through and marked with a cross.
 * Keys 1 to 4 pick an option, and "Tiếp" takes the focus so Enter moves on. */
export function QuizCard({
  question, selected, onSelect, onNext,
}: {
  question: QuizQuestion
  selected: string | null
  onSelect: (option: string) => void
  onNext: () => void
}) {
  const answered = selected !== null
  const nextRef = useRef<HTMLButtonElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const settled = useKeyGate(answered)

  useEffect(() => {
    if (answered) nextRef.current?.focus({ preventScroll: true })
  }, [answered])

  useEffect(() => {
    if (answered) return
    function onKey(e: KeyboardEvent) {
      const key = onlyKey(e, cardRef.current)
      const opt = key ? question.options[Number(key) - 1] : undefined
      if (opt !== undefined) { e.preventDefault(); if (settled(e)) onSelect(opt) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [answered, question, onSelect, settled])

  return (
    <div
      ref={cardRef}
      className={p.card}
      onKeyDownCapture={(e) => holdBack(e, settled)}
    >
      <div className={p.head}>
        <Hw text={question.headword} lang={question.lang} className={p.big} />
        <AudioButton text={question.headword} lang={question.lang} />
      </div>
      <Ipa value={question.ipa} lang={question.lang} className={p.pron} />
      <p className={p.ask}>Chọn nghĩa đúng</p>

      {/* The screen reader hears the verdict the fill and the icons show. */}
      {answered && (
        <p role="status" aria-live="polite" className="sr-only">
          {selected === question.answer ? 'Đúng' : `Sai. Đáp án: ${question.answer}`}
        </p>
      )}

      <div className={p.opts}>
        {question.options.map((opt, i) => {
          const state = !answered ? undefined : opt === question.answer ? 'ok' : opt === selected ? 'no' : 'rest'
          return (
            <button
              key={opt}
              type="button"
              disabled={answered}
              onClick={() => onSelect(opt)}
              className={p.opt}
              data-opt=""
              data-state={state}
            >
              <kbd className={p.kbd} aria-hidden="true">{i + 1}</kbd>
              <span>{opt}</span>
              <span className={p.mk}>{state === 'ok' ? CHECK : state === 'no' ? CROSS : null}</span>
            </button>
          )
        })}
      </div>

      {answered && (
        <button ref={nextRef} type="button" onClick={onNext} className={`${p.btn} ${p.wide}`}>
          Tiếp
        </button>
      )}
    </div>
  )
}
