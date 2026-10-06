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
  question, listen = false, selected, onSelect, onNext,
}: {
  question: QuizQuestion
  /** The word is heard, not read, until the answer is chosen. */
  listen?: boolean
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
      {question.gap ? (
        <>
          <p className={p.meta}>Ghép cụm từ</p>
          <p className={p.sentence} lang={question.lang}>
            {question.gap.before}{' '}
            {answered ? <b data-hw="">{question.answer}</b> : <span className={p.blank}><span className="sr-only">chỗ trống</span></span>}
            {' '}{question.gap.after}
          </p>
          {question.gap.meaningVi && <p className={p.ask}>Nghĩa: <b>{question.gap.meaningVi}</b></p>}
          <p className={p.ask}>Chọn từ còn thiếu</p>
        </>
      ) : listen && !answered ? (
        <>
          <p className={p.meta}>Nghe rồi chọn nghĩa</p>
          <div className={p.play}>
            <AudioButton text={question.headword} lang={question.lang} audioUrl={question.audioUrl ?? null} label="Phát âm từ cần nghe" />
          </div>
          <p className={p.ask}>Chọn nghĩa đúng</p>
        </>
      ) : (
        <>
          <div className={p.head}>
            <Hw text={question.headword} lang={question.lang} className={p.big} />
            <AudioButton text={question.headword} lang={question.lang} audioUrl={question.audioUrl ?? null} />
          </div>
          <Ipa value={question.ipa} lang={question.lang} className={p.pron} />
          <p className={p.ask}>Chọn nghĩa đúng</p>
        </>
      )}

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
