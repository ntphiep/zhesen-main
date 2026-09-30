'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { listDueCards, gradeCard, type ReviewCard } from '@/lib/wordlist/review'
import type { Grade, SrsState } from '@/lib/progress/types'
import { WordReviewCard } from '@/components/practice/WordReviewCard'
import { GradeSyncWarning } from '@/components/practice/GradeSyncWarning'
import { useGradeSync } from '@/lib/hooks/useGradeSync'
import { NoticeBar, useNotice } from '@/components/ui/Notice'
import { Loading, SessionBar, Stage } from '@/components/practice/SessionParts'
import p from './Practice.module.css'

export function WordlistReview() {
  const supabase = useMemo(() => createClient(), [])
  const [queue, setQueue] = useState<ReviewCard[] | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [reviewed, setReviewed] = useState(0)
  // Recording the day is the session's job, not `gradeCard`'s: doing it there makes a
  // streak failure surface as a grade failure and every practice mode write it twice.
  const { logDay, failed: syncFailed } = useGradeSync(supabase)
  const logged = useRef(false)
  // A grade is a round trip and `current` does not change until it returns, so without
  // this a second tap regrades the same card and drops one off the front of the queue.
  const [grading, setGrading] = useState(false)
  const { notice, notify, dismiss } = useNotice()

  useEffect(() => {
    listDueCards(supabase, Date.now()).then(setQueue).catch(() => setQueue([]))
  }, [supabase])

  if (queue === null) return <Loading />

  if (queue.length === 0) {
    return (
      <Stage>
        <div className={`${p.card} ${p.end}`}>
          <h1>Hết từ cần ôn.</h1>
          {reviewed > 0 && <p>Đã ôn {reviewed} từ trong phiên này.</p>}
          <GradeSyncWarning failed={syncFailed} />
          <div className={p.row}><Link href="/practice" className={p.btn}>Về luyện tập</Link></div>
        </div>
      </Stage>
    )
  }

  const current = queue[0]

  async function grade(g: Grade) {
    if (grading) return
    setGrading(true)
    let next: SrsState
    try {
      next = await gradeCard(supabase, current, g, Date.now())
    } catch {
      notify('Chưa lưu được kết quả. Thử lại.')
      return
    } finally {
      setGrading(false)
    }
    if (!logged.current) { logged.current = true; logDay() }
    setRevealed(false)
    setReviewed((n) => n + 1)
    setQueue((q) => {
      const rest = (q as ReviewCard[]).slice(1)
      // A card graded "again" must come back carrying the schedule it just earned;
      // re-queueing `current` untouched grades the next answer from before the lapse.
      return g === 'again' ? [...rest, { ...current, state: next }] : rest
    })
  }

  return (
    <Stage>
      <SessionBar label={`Còn lại: ${queue.length}`} done={reviewed} total={reviewed + queue.length} />
      <WordReviewCard
        key={`${current.id}-${reviewed}`}
        card={current}
        revealed={revealed}
        onReveal={() => setRevealed(true)}
        onGrade={grade}
        grading={grading}
      />
      <NoticeBar notice={notice} onDismiss={dismiss} />
    </Stage>
  )
}
