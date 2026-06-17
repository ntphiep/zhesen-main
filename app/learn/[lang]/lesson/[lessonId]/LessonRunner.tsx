'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { Lesson, VocabItem } from '@/lib/content/types'
import { buildQuiz } from '@/lib/quiz/buildQuiz'
import { Quiz } from '@/components/Quiz'
import { getProgressStore } from '@/lib/progress'

type Phase = 'intro' | 'quiz' | 'done'

export function LessonRunner({ lesson, vocab, pool }: { lesson: Lesson; vocab: VocabItem[]; pool: VocabItem[] }) {
  const [phase, setPhase] = useState<Phase>('intro')
  const questions = useMemo(() => buildQuiz(vocab, pool), [vocab, pool])

  async function finish() {
    const now = Date.now()
    const store = getProgressStore()
    await store.ensureCards(vocab.map((v) => ({ vocabId: v.id, lang: v.lang })), now)
    await store.setLessonProgress(lesson.id, 'completed', now)
    setPhase('done')
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <Link href={`/learn/${lesson.lang}`} className="text-sm text-black/50 hover:underline">← Quay lại</Link>
      <h1 className="mt-3 text-2xl font-bold">{lesson.title}</h1>

      {phase === 'intro' && (
        <div className="mt-6">
          <ul className="space-y-3">
            {vocab.map((v) => (
              <li key={v.id} className="rounded-xl border border-black/10 p-4">
                <div className="text-2xl font-semibold">{v.term}</div>
                {v.reading && <div className="text-black/50">{v.reading}</div>}
                <div className="mt-1">{v.translation.vi}</div>
              </li>
            ))}
          </ul>
          <button onClick={() => setPhase('quiz')} className="mt-6 rounded-lg bg-black px-5 py-2 text-white">
            Bắt đầu luyện tập
          </button>
        </div>
      )}

      {phase === 'quiz' && <div className="mt-6"><Quiz questions={questions} onDone={finish} /></div>}

      {phase === 'done' && (
        <div className="mt-10 text-center">
          <div className="text-2xl font-semibold">Hoàn thành bài học! 🎉</div>
          <p className="mt-2 text-black/60">Các từ đã được thêm vào hàng đợi ôn tập.</p>
          <Link href={`/learn/${lesson.lang}`} className="mt-6 inline-block rounded-lg bg-black px-5 py-2 text-white">
            Về bảng điều khiển
          </Link>
        </div>
      )}
    </main>
  )
}
