'use client'
import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { GradeSyncWarning } from '@/components/practice/GradeSyncWarning'
import { AudioButton } from '@/components/ui/AudioButton'
import { entryPath } from '@/lib/dictionary/entryId'
import { useGradeSync } from '@/lib/hooks/useGradeSync'
import { useReducedMotion } from '@/lib/hooks/useReducedMotion'
import { gradeForMode, type PracticeOutcome } from '@/lib/practice/grading'
import type { Grade, SrsState } from '@/lib/progress/types'
import { dueNote, whenLabel } from '@/lib/wordlist/forecast'
import { gradeWordById, type ReviewCard } from '@/lib/wordlist/review'
import { Hw, NAME, Pron } from './HomeParts'
import h from './Home.module.css'

const GRADES: { grade: Grade; label: string; outcome: PracticeOutcome }[] = [
  { grade: 'again', label: 'Lại', outcome: { correct: false } },
  { grade: 'hard', label: 'Khó', outcome: { correct: true, nearly: true } },
  { grade: 'good', label: 'Tốt', outcome: { correct: true } },
  { grade: 'easy', label: 'Dễ', outcome: { correct: true, easy: true } },
]

/** How long the graded card takes to leave, matching `cardOut` in Home.module.css. */
const OUT_MS = 190

interface Last { card: ReviewCard; again: boolean; dueAt: number }

/**
 * Today's session on the home page: reveal, then grade yourself. Each grade goes through
 * `gradeForMode('review', ...)` and `gradeWordById`, like every practice mode, and waits for
 * the write before moving on, so a lost write shows here rather than in a count that lies.
 * A card graded Lại comes back at the end carrying the schedule it just earned.
 */
export function HomeReviewDeck({ cards, supabase, now, total, onGraded }: {
  cards: ReviewCard[]
  supabase: SupabaseClient
  /** When the queue was read, for the due notes. */
  now: number
  /** Saved words in all, to tell an empty notebook from a finished session. */
  total: number
  onGraded: (id: string, next: SrsState) => void
}) {
  const reduced = useReducedMotion()
  const labelId = useId()
  const [queue, setQueue] = useState(cards)
  const [open, setOpen] = useState(false)
  const [grading, setGrading] = useState(false)
  const [anim, setAnim] = useState<'in' | 'out' | null>(null)
  const [reviewed, setReviewed] = useState(0)
  // Bumped as each card leaves, so the next one mounts afresh and plays its entrance.
  const [turn, setTurn] = useState(0)
  const [last, setLast] = useState<Last | null>(null)
  const [error, setError] = useState(false)
  // The click handler runs twice before `grading` re-renders on a double tap; a ref does not.
  const busy = useRef(false)
  const logged = useRef(false)
  const revealRef = useRef<HTMLButtonElement>(null)
  const goodRef = useRef<HTMLButtonElement>(null)
  const { logDay, failed } = useGradeSync(supabase)
  const current = queue[0] ?? null

  useEffect(() => {
    if (open) goodRef.current?.focus({ preventScroll: true })
  }, [open])

  async function grade(g: (typeof GRADES)[number]) {
    if (!current || busy.current) return
    const grade = gradeForMode('review', g.outcome)
    if (!grade) return
    busy.current = true
    setGrading(true)
    setError(false)
    let next: SrsState | null
    try {
      next = await gradeWordById(supabase, current.id, grade)
    } catch {
      setError(true)
      busy.current = false
      setGrading(false)
      return
    }
    if (!logged.current) { logged.current = true; logDay() }
    if (next) onGraded(current.id, next)
    const again = g.grade === 'again'
    setLast(next ? { card: current, again, dueAt: next.dueAt } : null)
    setReviewed((n) => n + 1)
    const advance = () => {
      setQueue((q) => {
        const rest = q.slice(1)
        return again && next ? [...rest, { ...q[0], state: next }] : rest
      })
      setOpen(false)
      setTurn((t) => t + 1)
      setAnim(reduced ? null : 'in')
      busy.current = false
      setGrading(false)
      requestAnimationFrame(() => revealRef.current?.focus({ preventScroll: true }))
    }
    if (reduced) { advance(); return }
    setAnim('out')
    window.setTimeout(advance, OUT_MS)
  }

  return (
    <section className={h.deck} aria-labelledby={labelId}>
      <div className={h.lblRow}>
        <p className={h.lbl} id={labelId}>Phiên ôn hôm nay</p>
        <span className={h.left} aria-live="polite">{reviewed > 0 && `Đã ôn ${reviewed} từ`}</span>
      </div>
      <div className={h.slot} data-empty={current ? undefined : ''}>
        {current ? (
          <article key={`${current.id}-${turn}`} className={h.rc} data-open={open || undefined} data-anim={anim ?? undefined} aria-label="Từ đang ôn">
            <div className={h.meta}>
              <span>{NAME[current.lang]}</span>
              <span>{dueNote(current.state.reps, current.state.dueAt, now)}</span>
            </div>
            <div className={h.head}>
              {current.entryId
                ? <Link href={entryPath(current.entryId)} prefetch={false} className={h.plain}><Hw lang={current.lang} text={current.headword} /></Link>
                : <Hw lang={current.lang} text={current.headword} />}
              <AudioButton text={current.headword} lang={current.lang} audioUrl={current.audioUrl} />
            </div>
            <Pron w={current} className={h.pr} />
            {!open && (
              <button ref={revealRef} type="button" className={`${h.btn} ${h.reveal}`} onClick={() => setOpen(true)}>Hiện nghĩa</button>
            )}
            <div className={h.back}>
              <div inert={!open}>
                <div className={h.mean} role="status">{current.meaningVi}</div>
                {current.example && (
                  <p className={h.ex}><span lang={current.lang}>{current.example}</span>{current.exampleTranslation}</p>
                )}
                <div className={h.grades}>
                  {GRADES.map((g) => (
                    <button
                      key={g.grade}
                      ref={g.grade === 'good' ? goodRef : undefined}
                      type="button"
                      data-g={g.grade}
                      disabled={grading}
                      onClick={() => void grade(g)}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
                {error && <p className={h.fail}>Chưa lưu được kết quả. Thử lại.</p>}
              </div>
            </div>
          </article>
        ) : (
          <div className={`${h.rc} ${h.done}`} data-anim={anim && reviewed ? 'in' : undefined}>
            <b>{reviewed ? 'Hết từ cần ôn.' : total ? 'Chưa có từ đến hạn ôn hôm nay.' : 'Chưa có từ. Tra một từ để lưu.'}</b>
            <p>{reviewed > 0 && `Đã ôn ${reviewed} từ trong phiên này.`}</p>
            <Link className={h.btn} href="/practice" prefetch={false}>Luyện tập</Link>
          </div>
        )}
      </div>
      <p className={h.after} aria-live="polite">
        {last && <><Hw lang={last.card.lang} text={last.card.headword} /> {last.again ? 'quay lại cuối phiên này.' : `quay lại ${when(last.dueAt, now)}.`}</>}
      </p>
      <GradeSyncWarning failed={failed} />
    </section>
  )
}

function when(dueAt: number, now: number): string {
  const label = whenLabel(dueAt, now)
  return label === 'hôm nay' || label === 'ngày mai' ? label : `vào ${label}`
}
