import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getWordlistStats } from '@/lib/wordlist/stats'
import { WordlistStats } from '@/components/wordlist/WordlistStats'
import { WordlistDistribution } from '@/components/wordlist/WordlistDistribution'
import { PracticeModes } from '@/components/wordlist/PracticeModes'

// Practice hub: progress stats + every study mode, working over the saved wordlist.
export default async function PracticePage() {
  const supabase = await createClient()
  const stats = await getWordlistStats(supabase)
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/" className="text-sm text-black/50 hover:underline">← Trang chủ</Link>
      <h1 className="mt-3 text-3xl font-bold">Luyện tập</h1>
      <p className="mt-1 text-sm text-black/60">Học các từ trong sổ tay bằng nhiều cách khác nhau.</p>
      {stats.total === 0 ? (
        <div className="mt-6 rounded-xl border border-black/10 p-6 text-black/60">
          Sổ tay chưa có từ nào.{' '}
          <Link href="/dictionary" className="font-medium text-black underline">Tra cứu và thêm từ</Link>{' '}
          để bắt đầu luyện tập.
        </div>
      ) : (
        <>
          <WordlistStats stats={stats} />
          <WordlistDistribution stats={stats} />
          <PracticeModes due={stats.due} />
        </>
      )}
    </main>
  )
}
