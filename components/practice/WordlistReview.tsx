'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { listDueCards, gradeCard, type ReviewCard } from '@/lib/wordlist/review'
import type { Grade, SrsState } from '@/lib/progress/types'
import { WordReviewCard } from '@/components/practice/WordReviewCard'
import { GradeSyncWarning } from '@/components/practice/GradeSyncWarning'
import { useGradeSync } from '@/lib/hooks/useGradeSync'

export function WordlistReview() {
  const supabase = useMemo(() => createClient(), [])
  const [queue, setQueue] = useState<ReviewCard[] | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [reviewed, setReviewed] = useState(0)
  // Only for the streak here: this session grades through `gradeCard`, which
  // carries the schedule it already holds, and reports a failed grade with its
  // own alert. `gradeCard` used to record the day itself, which meant a streak
  // failure surfaced as a grade failure and every practice mode wrote the day
  // twice. Recording it is the session's job, and this was the one session
  // without a way to say the write did not land.
  const { logDay, failed: syncFailed } = useGradeSync(supabase)
  const logged = useRef(false)
  // A grade is a network round trip, and `current` does not change until it
  // returns. Without this, a second tap graded the same card again from its old
  // state and dropped one off the front of the queue for each tap: the next card
  // was never shown and the session claimed to have reviewed it. One double-tap
  // on a phone, or one impatient tap on a slow connection, was enough.
  const [grading, setGrading] = useState(false)

  useEffect(() => {
    listDueCards(supabase, Date.now()).then(setQueue).catch(() => setQueue([]))
  }, [supabase])

  if (queue === null) return <main className="p-12 text-center text-black/50">Đang tải…</main>

  if (queue.length === 0) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <div className="text-2xl font-semibold">Hết thẻ cần ôn 🎉</div>
        {reviewed > 0 && <p className="mt-2 text-black/50">Đã ôn {reviewed} từ trong phiên này.</p>}
        <GradeSyncWarning failed={syncFailed} />
        <Link href="/practice" className="mt-6 inline-block rounded-lg bg-black px-5 py-2 text-white">
          Về luyện tập
        </Link>
      </main>
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
      alert('Không lưu được kết quả ôn tập. Vui lòng thử lại.')
      return
    } finally {
      setGrading(false)
    }
    if (!logged.current) { logged.current = true; logDay() }
    setRevealed(false)
    setReviewed((n) => n + 1)
    setQueue((q) => {
      const rest = (q as ReviewCard[]).slice(1)
      // A card graded "again" comes back later in the session, carrying the
      // schedule it just earned. Re-queueing `current` untouched sent its old
      // state into the next grade, so answering "good" on the second showing
      // wrote a schedule computed from before the lapse: the interval jumped
      // back out to weeks and the lapse count reset to zero.
      return g === 'again' ? [...rest, { ...current, state: next }] : rest
    })
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <div className="mb-4 flex items-center justify-between text-sm text-black/50">
        <Link href="/practice" className="hover:underline">← Thoát</Link>
        <span>Còn lại: {queue.length}</span>
      </div>
      <WordReviewCard
        card={current}
        revealed={revealed}
        onReveal={() => setRevealed(true)}
        onGrade={grade}
        grading={grading}
      />
    </main>
  )
}
