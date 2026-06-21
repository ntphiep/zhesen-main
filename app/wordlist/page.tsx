// app/wordlist/page.tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { listWords } from '@/lib/wordlist/store'
import { getWordlistStats } from '@/lib/wordlist/stats'
import { WordlistStats } from './WordlistStats'
import { PracticeModes } from './PracticeModes'
import { WordlistClient } from './WordlistClient'

export default async function WordlistPage() {
  const supabase = await createClient()
  const [words, stats] = await Promise.all([listWords(supabase), getWordlistStats(supabase, Date.now())])
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link href="/" className="text-sm text-black/50 hover:underline">← Trang chủ</Link>
      <h1 className="mt-3 text-3xl font-bold">Danh sách từ</h1>
      <p className="mt-1 text-sm text-black/60">Nơi lưu các từ bạn đã học. Lưu ý: danh sách gắn với phiên trình duyệt hiện tại.</p>
      <WordlistStats stats={stats} />
      {words.length > 0 && <PracticeModes due={stats.due} />}
      <div className="mt-6">
        <WordlistClient initialWords={words} />
      </div>
    </main>
  )
}
