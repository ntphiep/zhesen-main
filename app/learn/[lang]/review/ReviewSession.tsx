'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { LangCode, VocabItem } from '@/lib/content/types'
import type { Grade } from '@/lib/progress/types'
import { Flashcard } from '@/components/Flashcard'
import { getProgressStore } from '@/lib/progress'

export function ReviewSession({ lang, vocab }: { lang: LangCode; vocab: VocabItem[] }) {
  const byId = useMemo(() => new Map(vocab.map((v) => [v.id, v])), [vocab])
  const [queue, setQueue] = useState<string[] | null>(null)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    getProgressStore()
      .getDueCards(lang, Date.now())
      .then((cards) => setQueue(cards.map((c) => c.vocabId)))
  }, [lang])

  if (queue === null) return <main className="p-12 text-center">Đang tải…</main>

  if (queue.length === 0) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <div className="text-2xl font-semibold">Hết thẻ cần ôn 🎉</div>
        <Link href={`/learn/${lang}`} className="mt-6 inline-block rounded-lg bg-black px-5 py-2 text-white">
          Quay lại
        </Link>
      </main>
    )
  }

  const currentId = queue[0]
  const current = byId.get(currentId)!

  async function grade(g: Grade) {
    await getProgressStore().recordReview(currentId, g, Date.now())
    setRevealed(false)
    setQueue((q) => {
      const rest = (q as string[]).slice(1)
      return g === 'again' ? [...rest, currentId] : rest // re-queue "again" at the end
    })
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <div className="mb-4 flex items-center justify-between text-sm text-black/50">
        <Link href={`/learn/${lang}`} className="hover:underline">← Thoát</Link>
        <span>Còn lại: {queue.length}</span>
      </div>
      <Flashcard vocab={current} revealed={revealed} onReveal={() => setRevealed(true)} onGrade={grade} />
    </main>
  )
}
