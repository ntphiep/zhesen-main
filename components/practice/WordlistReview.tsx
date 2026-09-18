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
      notify('Không lưu được kết quả ôn tập. Vui lòng thử lại.')
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
      <NoticeBar notice={notice} onDismiss={dismiss} />
    </main>
  )
}
