'use client'
import { useEffect, useRef } from 'react'
import { AudioButton, SourceLink } from '@/components/ui/AudioButton'
import type { ReviewCard } from '@/lib/wordlist/review'
import type { Grade } from '@/lib/progress/types'
import { Ipa } from '@/components/ui/Ipa'
import { Hw } from '@/components/practice/SessionParts'
import { onlyKey } from '@/components/practice/keys'
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
  const revealRef = useRef<HTMLButtonElement>(null)
  const goodRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    ;(revealed ? goodRef : revealRef).current?.focus({ preventScroll: true })
  }, [revealed, card.id])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const key = onlyKey(e)
      if (!key) return
      if (!revealed && key === ' ') { e.preventDefault(); onReveal(); return }
      const g = revealed && !grading ? GRADES[Number(key) - 1] : undefined
      if (g) { e.preventDefault(); onGrade(g.grade) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealed, grading, onReveal, onGrade])

  return (
    <div className={p.card}>
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
            {card.meaningEn && <div className={p.gloss}>{card.meaningEn}</div>}
            {card.example && (
              <div className={p.ex}>
                <span lang={card.lang}>{card.example}</span>
                {card.exampleTranslation && <small>{card.exampleTranslation}</small>}
              </div>
            )}
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
