import { LookupPair } from '@/components/search/LookupPair'
import { DiscoveryStrip } from '@/components/search/DiscoveryStrip'
import { isLangCode } from '@/lib/languages'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Dịch',
  description: 'Dịch tiếng Việt sang Anh, Trung, Tây Ban Nha, và ngược lại. Một từ hay cả đoạn.',
})

/**
 * Two boxes, one per direction, instead of one box that guessed.
 *
 * Nothing in a Vietnamese word separates it from an English or Spanish one: "an", "ban"
 * and "con" are real headwords in both. The guess was wrong often enough that "cá"
 * answered with ca, can and called, and it cost a second database call every time it was
 * unsure. Which box the learner types in is the answer.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; lang?: string }> }) {
  const sp = await searchParams
  // `searchPath` (lib/dictionary/entryId.ts) appends the language, because a chip for a
  // related word or an inflected form already knows which language it came from.
  const lang = sp.lang && isLangCode(sp.lang) ? sp.lang : undefined
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-3xl font-bold">Dịch</h1>
      <div className="mt-6">
        <LookupPair lang={lang} initialQuery={sp.q ?? ''} autoFocus />
      </div>
      <DiscoveryStrip />
    </main>
  )
}
