import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requirePermanentAccount } from '@/lib/auth/guard'
import { TOEIC_TESTS } from '@/lib/practice/toeic/tests'
import { TOEIC_PATH, toeicTestPath } from '@/lib/practice/toeic/session'
import { theoryBlockPath } from '@/lib/theory/path'
import { ToeicLastResult } from '@/components/practice/ToeicLastResult'
import { pageMetadata } from '@/lib/site'
import p from '@/components/practice/Practice.module.css'
import t from '@/components/practice/Toeic.module.css'

export const metadata = pageMetadata({
  title: 'Luyện đề TOEIC Reading',
  description: 'Làm đề TOEIC Reading có giờ hoặc luyện từng Part.',
  canonical: '/practice/toeic',
})

const PARTS = [5, 6, 7] as const

/** Behind an account like every practice mode, sent back here after signing in. */
export default async function ToeicHubPage() {
  await requirePermanentAccount(await createClient(), TOEIC_PATH)
  return (
    <main className={`${p.pr} mx-auto w-full max-w-page px-6 pt-8 pb-16 font-ui`}>
      <Link href={theoryBlockPath('en', 'toeic')} className={p.back}>← Lý thuyết TOEIC</Link>
      <h1 className={p.title}>Luyện đề TOEIC Reading</h1>
      <p className={p.lede}>Làm đề có giờ hoặc luyện từng Part.</p>
      <div className={t.tests}>
        {TOEIC_TESTS.map((test) => {
          const path = toeicTestPath(test.id)
          const count = test.groups.reduce((n, g) => n + g.questions.length, 0)
          return (
            <article key={test.id} className={t.test}>
              <h2>{test.titleVi}</h2>
              <p>{count} câu Part 5, Part 6 và Part 7</p>
              <div className={t.actions}>
                <Link href={path} className={p.btn}>Thi thử 75 phút</Link>
                {PARTS.map((x) => (
                  <Link key={x} href={`${path}?part=${x}`} className={p.ghost}>Part {x}</Link>
                ))}
              </div>
              <ToeicLastResult testId={test.id} />
            </article>
          )
        })}
      </div>
    </main>
  )
}
