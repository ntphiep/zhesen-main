'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { listDueCards, gradeCard, type ReviewCard } from '@/lib/wordlist/review'
import type { Grade } from '@/lib/progress/types'
import { WordReviewCard } from '@/components/practice/WordReviewCard'

export function WordlistReview() {
  const supabase = useMemo(() => createClient(), [])
  const [queue, setQueue] = useState<ReviewCard[] | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [reviewed, setReviewed] = useState(0)

  useEffect(() => {
    listDueCards(supabase, Date.now()).then(setQueue).catch(() => setQueue([]))
  }, [supabase])

  if (queue === null) return <main className="p-12 text-center text-black/50">Đang tải…</main>

  if (queue.length === 0) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <div className="text-2xl font-semibold">Hết thẻ cần ôn 🎉</div>
        {reviewed > 0 && <p className="mt-2 text-black/50">Đã ôn {reviewed} từ trong phiên này.</p>}
        <Link href="/practice" className="mt-6 inline-block rounded-lg bg-black px-5 py-2 text-white">
          Về luyện tập
        </Link>
      </main>
    )
  }

  const current = queue[0]

  async function grade(g: Grade) {
    await gradeCard(supabase, current, g, Date.now())
    setRevealed(false)
    setReviewed((n) => n + 1)
    setQueue((q) => {
      const rest = (q as ReviewCard[]).slice(1)
      return g === 'again' ? [...rest, current] : rest // re-show "again" later this session
    })
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <div className="mb-4 flex items-center justify-between text-sm text-black/50">
        <Link href="/practice" className="hover:underline">← Thoát</Link>
        <span>Còn lại: {queue.length}</span>
      </div>
      <WordReviewCard card={current} revealed={revealed} onReveal={() => setRevealed(true)} onGrade={grade} />
    </main>
  )
}
