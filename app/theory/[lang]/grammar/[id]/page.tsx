import { notFound } from 'next/navigation'
import { getLanguage, isLangCode } from '@/lib/languages'
import { getCachedGrammarPointDetail } from '@/lib/grammar/cached'
import { getCachedTappableTexts } from '@/lib/dictionary/cached'
import { buildGrammarPointId, grammarKeyFromPath, grammarPointPath } from '@/lib/grammar/path'
import { GrammarPointDetailView } from '@/components/grammar/GrammarPointDetailView'
import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/site'
import { TheoryBreadcrumb } from '@/components/seo/BreadcrumbJsonLd'

/**
 * Empty on purpose. A dynamic segment is only eligible for the full route cache
 * once it declares this function; without it Next.js renders the page for every
 * request and marks the response `private, no-cache, no-store`, which is why
 * repeat visits to the same word never hit the CDN. Returning no params prerenders
 * nothing at build -- the dictionary has 36,361 entries and the vast majority are
 * never opened -- and `dynamicParams` stays at its default, so a word is rendered
 * the first time somebody asks for it and served from the edge afterwards.
 */
export function generateStaticParams(): { lang: string; id: string }[] {
  return []
}


/**
 * Everything this page reads comes from `unstable_cache`, and none of it depends
 * on the request: no cookie, no header, no search parameter. Without this export
 * Next.js still renders it on demand for every visitor and sends
 * `Cache-Control: private, no-cache, no-store`, so the CDN holds nothing and each
 * visit pays the full round trip to the function. With it the rendered page is
 * stored and served from the edge, on the same one-hour window the data caches
 * already use.
 */
// One week, the literal value of `LEX_REVALIDATE` in `lib/dictionary/cached.ts`,
// which the data caches under this page use and which explains the figure. Written
// out because a segment config must be statically analysable: importing the constant
// fails the build with "Invalid segment configuration export detected".
export const revalidate = 604800


type Params = Promise<{ lang: string; id: string }>

/** Same reasoning as the dictionary entry page: the grammar point's own title is
 *  what a search result should carry, and `getCachedGrammarPointDetail` is an
 *  `unstable_cache` call so reading it twice per request costs one read. */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang, id } = await params
  if (!isLangCode(lang)) return {}
  const point = await getCachedGrammarPointDetail(buildGrammarPointId(lang, grammarKeyFromPath(id)))
  if (!point) return {}
  const language = getLanguage(lang)
  return pageMetadata({
    title: `${point.titleVi} · Ngữ pháp ${language?.name ?? lang}`,
    description: `Học "${point.titleVi}" qua cấu trúc ${point.pattern}, giải thích và ví dụ.`,
    canonical: grammarPointPath(point.id),
  })
}

export default async function GrammarPointPage({ params }: { params: Params }) {
  const { lang, id } = await params
  if (!isLangCode(lang)) notFound()
  const pointId = buildGrammarPointId(lang, grammarKeyFromPath(id))

  const point = await getCachedGrammarPointDetail(pointId)
  if (!point) notFound()

  // Same reason as the dictionary entry page: resolved here, the example sentences
  // are in the HTML. Left to each TappableText, every sentence is its own chain of
  // requests from the browser and stays blank until the last one returns.
  const resolved = await getCachedTappableTexts(point.lang, point.examples.map((e) => e.text))

  const language = getLanguage(point.lang)
  return (
    <>
      {language && <TheoryBreadcrumb language={language} block="grammar" leaf={point.titleVi} />}
      <GrammarPointDetailView point={point} resolved={resolved} />
    </>
  )
}
