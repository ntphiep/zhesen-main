import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getWordlistStats } from '@/lib/wordlist/stats'
import { requirePermanentAccount } from '@/lib/auth/guard'
import { WordlistStats } from '@/components/wordlist/WordlistStats'
import { WordlistDistribution } from '@/components/wordlist/WordlistDistribution'
import { PracticeModes } from '@/components/practice/PracticeModes'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Luyện tập',
  description: 'Ôn từ đã lưu bằng nhiều cách.',
})

// Practice hub: progress stats + every study mode, working over the saved
// wordlist. Each mode page calls the guard with its own path, so signing in lands
// back on that mode; a layout cannot, because it never sees the pathname.
export default async function PracticePage() {
  const supabase = await createClient()
  await requirePermanentAccount(supabase, '/practice')
  const stats = await getWordlistStats(supabase)
  return (
    <main className="mx-auto max-w-page px-6 py-10">
      <Link href="/" className="text-sm text-black/50 hover:underline">← Trang chủ</Link>
      <h1 className="mt-3 text-3xl font-bold">Luyện tập</h1>
      <p className="mt-1 text-sm text-black/60">Ôn từ đã lưu bằng nhiều cách.</p>
      {stats.total === 0 ? (
        <div className="mt-6 rounded-xl border border-black/10 p-6 text-black/60">
          Chưa có từ.{' '}
          <Link href="/dictionary" className="font-medium text-black underline">Tra một từ</Link>{' '}
          để lưu.
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
