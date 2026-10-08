'use client'
import { useEffect, useRef } from 'react'
import { AudioButton, SourceLink } from '@/components/ui/AudioButton'
import type { ReviewCard } from '@/lib/wordlist/review'
import { cardBack } from '@/lib/practice/cardBack'
import type { Grade } from '@/lib/progress/types'
import { Ipa } from '@/components/ui/Ipa'
import { Hw } from '@/components/practice/SessionParts'
import { holdBack, onlyKey, spaceIsFree } from '@/components/practice/keys'
import { useKeyGate } from '@/lib/hooks/useKeyGate'
import p from './Practice.module.css'

const GRADES: { grade: Grade; label: string }[] = [
  { grade: 'again', label: 'Lại' },
  { grade: 'hard', label: 'Khó' },
  { grade: 'good', label: 'Tốt' },
  { grade: 'easy', label: 'Dễ' },
]

/** Space shows the meaning and 1 to 4 grade it; the keys sit on the buttons they press. */
export function WordReviewCard({
  card, revealed, onReveal, onGrade, grading = false,
}: {
  card: ReviewCard
  revealed: boolean
  onReveal: () => void
  onGrade: (g: Grade) => void
  /** A grade is in flight; the buttons must not accept a second tap. */
  grading?: boolean
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const revealRef = useRef<HTMLButtonElement>(null)
  // Showing the meaning is a new step: the press that showed it cannot also grade it.
  const settled = useKeyGate(revealed)
  const goodRef = useRef<HTMLButtonElement>(null)
  const back = cardBack(card)

  useEffect(() => {
    ;(revealed ? goodRef : revealRef).current?.focus({ preventScroll: true })
  }, [revealed, card.id])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const key = onlyKey(e, cardRef.current)
      if (!key || !cardRef.current) return
      if (!revealed && key === ' ') {
        if (!spaceIsFree(e, cardRef.current)) return
        e.preventDefault()
        if (settled(e)) onReveal()
        return
      }
      const g = revealed && !grading ? GRADES[Number(key) - 1] : undefined
      if (g) { e.preventDefault(); if (settled(e)) onGrade(g.grade) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealed, grading, onReveal, onGrade, settled])

  return (
    <div
      ref={cardRef}
      className={p.card}
      onKeyDownCapture={(e) => holdBack(e, settled)}
    >
      <div className={p.head}>
        <Hw text={card.headword} lang={card.lang} className={p.big} />
        <AudioButton text={card.headword} lang={card.lang} audioUrl={card.audioUrl} />
        <span className={p.src}><SourceLink url={card.audioUrl} /></span>
      </div>
      {card.reading && <div className={p.pron}>{card.reading}</div>}
      <Ipa value={card.ipa} lang={card.lang} className={p.pron} />

      {revealed ? (
        <>
          <div role="status" aria-live="polite" className={p.face}>
            {card.meaningVi && <div className={p.mean}>{card.meaningVi}</div>}
            {back.gist && <div className={p.gloss}>{back.gist}</div>}
            {card.meaningEn && <div className={p.gloss}>{card.meaningEn}</div>}
            {back.example && (
              <div className={p.ex}>
                <span lang={card.lang}>{back.example.text}</span>
                {back.example.translation && <small>{back.example.translation}</small>}
              </div>
            )}
            {back.notes && <p className={p.notes}>{back.notes}</p>}
          </div>
          <div className={p.grades}>
            {GRADES.map((g, i) => (
              <button
                key={g.grade}
                ref={g.grade === 'good' ? goodRef : undefined}
                type="button"
                data-g={g.grade}
                onClick={() => onGrade(g.grade)}
                disabled={grading}
              >
                {g.label}
                <kbd className={p.kbd} aria-hidden="true">{i + 1}</kbd>
              </button>
            ))}
          </div>
        </>
      ) : (
        <button ref={revealRef} type="button" onClick={onReveal} className={`${p.btn} ${p.wide}`}>
          Hiện nghĩa
          <kbd className={p.kbd} aria-hidden="true">Space</kbd>
        </button>
      )}
    </div>
  )
}
