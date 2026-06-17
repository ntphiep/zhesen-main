'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Language, Lesson } from '@/lib/content/types'
import { LessonList } from '@/components/LessonList'
import { getProgressStore } from '@/lib/progress'

export function LangDashboard({ language, lessons }: { language: Language; lessons: Lesson[] }) {
  const [due, setDue] = useState<number | null>(null)
  useEffect(() => {
    getProgressStore().countDue(language.code, Date.now()).then(setDue)
  }, [language.code])

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/" className="text-sm text-black/50 hover:underline">← Trang chủ</Link>
      <h1 className="mt-3 text-3xl font-bold">{language.name}</h1>

      <div className="mt-6 flex items-center justify-between rounded-xl bg-black/5 p-4">
        <span>Thẻ cần ôn hôm nay: <b>{due ?? '…'}</b></span>
        {due === 0 ? (
          <span className="rounded-lg bg-black px-4 py-2 text-white opacity-40 cursor-not-allowed">
            Ôn tập
          </span>
        ) : (
          <Link
            href={`/learn/${language.code}/review`}
            className="rounded-lg bg-black px-4 py-2 text-white"
          >
            Ôn tập
          </Link>
        )}
      </div>

      <h2 className="mt-10 mb-3 text-xl font-semibold">Bài học</h2>
      <LessonList lang={language.code} lessons={lessons} />
    </main>
  )
}
