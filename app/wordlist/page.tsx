// app/wordlist/page.tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { listWords } from '@/lib/wordlist/store'
import { getWordlistStats } from '@/lib/wordlist/stats'
import { WordlistStats } from './WordlistStats'
import { WordlistClient } from './WordlistClient'

export default async function WordlistPage() {
  const supabase = await createClient()
  const [words, stats] = await Promise.all([listWords(supabase), getWordlistStats(supabase, Date.now())])
  const due = stats.due
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link href="/" className="text-sm text-black/50 hover:underline">← Trang chủ</Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Danh sách từ</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/wordlist/quiz"
            className="inline-flex items-center gap-2 rounded-lg border border-black/15 px-4 py-2 text-sm font-medium text-black/70 hover:bg-black/5"
          >
            Kiểm tra
          </Link>
          <Link
            href="/wordlist/review"
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${due > 0 ? 'bg-black text-white' : 'border border-black/15 text-black/60 hover:bg-black/5'}`}
          >
            Ôn tập{due > 0 ? ` (${due})` : ''}
          </Link>
        </div>
      </div>
      <p className="mt-1 text-sm text-black/60">Nơi lưu các từ bạn đã học. Lưu ý: danh sách gắn với phiên trình duyệt hiện tại.</p>
      <WordlistStats stats={stats} />
      <div className="mt-6">
        <WordlistClient initialWords={words} />
      </div>
    </main>
  )
}
