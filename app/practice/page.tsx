import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getWordlistStats } from '@/lib/wordlist/stats'
import { requirePermanentAccount } from '@/lib/auth/guard'
import { WordlistStats } from '@/components/wordlist/WordlistStats'
import { WordlistDistribution } from '@/components/wordlist/WordlistDistribution'
import { PracticeModes } from '@/components/practice/PracticeModes'
import { pageMetadata } from '@/lib/site'
import p from '@/components/practice/Practice.module.css'

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
    <main className={`${p.pr} mx-auto w-full max-w-page px-6 pt-8 pb-16 font-ui`}>
      <Link href="/" className={p.back}>← Trang chủ</Link>
      <h1 className={p.title}>Luyện tập</h1>
      <p className={p.lede}>Ôn từ đã lưu bằng nhiều cách.</p>
      {stats.total === 0 ? (
        <div className={p.empty}>
          Chưa có từ. <Link href="/dictionary" prefetch={false}>Tra một từ</Link> để lưu.
        </div>
      ) : (
        <>
          <PracticeModes due={stats.due} />
          <h2 className={p.h2}>Tiến độ</h2>
          <WordlistStats stats={stats} />
          <WordlistDistribution stats={stats} />
        </>
      )}
    </main>
  )
}
