import { LookupPair } from '@/components/search/LookupPair'
import { DiscoveryStrip } from '@/components/search/DiscoveryStrip'
import s from '@/components/search/Lookup.module.css'
import { isLangCode } from '@/lib/languages'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Dịch',
  description: 'Dịch một từ hay cả đoạn giữa tiếng Việt và tiếng Anh, Trung, Tây Ban Nha.',
  // Every `?q=` URL consolidates here: a search result is not a page of its own.
  canonical: '/dictionary',
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
    <main className={`${s.page} font-ui`}>
      <div className="mx-auto max-w-page px-6 pt-8 pb-16">
        <h1 className="text-[2.34375rem] leading-tight font-extrabold tracking-[-0.03em] text-(--zs-ink)">Dịch</h1>
        <div className="mt-6">
          <LookupPair lang={lang} initialQuery={sp.q ?? ''} autoFocus />
        </div>
        <DiscoveryStrip />
      </div>
    </main>
  )
}
