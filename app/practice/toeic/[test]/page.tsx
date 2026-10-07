import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { requirePermanentAccount } from '@/lib/auth/guard'
import { getToeicTest, type ToeicPart } from '@/lib/practice/toeic/tests'
import { getCachedToeicWords } from '@/lib/practice/toeic/words'
import { toeicTestPath } from '@/lib/practice/toeic/session'
import { ToeicRunner } from '@/components/practice/ToeicRunner'
import { pageMetadata } from '@/lib/site'

// No static params or revalidate: the account guard reads the session cookie, which renders
// the page per request (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md).
// The word list keeps its own data cache.

type Params = Promise<{ test: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const test = getToeicTest((await params).test)
  if (!test) return {}
  return pageMetadata({
    title: `${test.titleVi} · TOEIC Reading`,
    description: 'Làm đề TOEIC Reading 75 phút hoặc luyện từng Part, có giải thích từng câu.',
    canonical: toeicTestPath(test.id),
  })
}

/** `?part=5|6|7` opens that part's practice. */
function partOf(v: string | string[] | undefined): ToeicPart | null {
  const n = Number(v)
  return n === 5 || n === 6 || n === 7 ? n : null
}

export default async function ToeicTestPage({ params, searchParams }: {
  params: Params
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ test: id }, query] = await Promise.all([params, searchParams])
  await requirePermanentAccount(await createClient(), toeicTestPath(id))
  const test = getToeicTest(id)
  if (!test) notFound()
  // Every passage, stem and option resolved in one pass, as on a grammar point, and sent as
  // one word list the browser tokenises against: per-text results repeat an entry in every
  // text holding the word.
  const words = await getCachedToeicWords(test.id, test.version)
  return <ToeicRunner key={String(query.part)} test={test} words={words} part={partOf(query.part)} />
}
