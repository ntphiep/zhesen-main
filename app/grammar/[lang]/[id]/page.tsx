import { notFound } from 'next/navigation'
import { getLanguage, isLangCode } from '@/lib/languages'
import { percentDecode } from '@/lib/http/percentDecode'
import { getCachedGrammarPointDetail } from '@/lib/grammar/cached'
import { getCachedTappableTexts } from '@/lib/dictionary/cached'
import { buildGrammarPointId, grammarPointPath } from '@/lib/grammar/path'
import { GrammarPointDetailView } from '@/components/grammar/GrammarPointDetailView'
import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/site'

type Params = Promise<{ lang: string; id: string }>

/** Same reasoning as the dictionary entry page: the grammar point's own title is
 *  what a search result should carry, and `getCachedGrammarPointDetail` is an
 *  `unstable_cache` call so reading it twice per request costs one read. */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang, id } = await params
  if (!isLangCode(lang)) return {}
  const point = await getCachedGrammarPointDetail(buildGrammarPointId(lang, percentDecode(id)))
  if (!point) return {}
  const language = getLanguage(lang)
  return pageMetadata({
    title: `${point.titleVi} · Ngữ pháp ${language?.name ?? lang}`,
    description: `Cấu trúc ${point.pattern}. Giải thích và ví dụ cho điểm ngữ pháp "${point.titleVi}".`,
    canonical: grammarPointPath(point.id),
  })
}

export default async function GrammarPointPage({ params }: { params: Params }) {
  const { lang, id } = await params
  if (!isLangCode(lang)) notFound()
  const pointId = buildGrammarPointId(lang, percentDecode(id))

  const point = await getCachedGrammarPointDetail(pointId)
  if (!point) notFound()

  // Same reason as the dictionary entry page: resolved here, the example sentences
  // are in the HTML. Left to each TappableText, every sentence is its own chain of
  // requests from the browser and stays blank until the last one returns.
  const resolved = await getCachedTappableTexts(point.lang, point.examples.map((e) => e.text))

  return <GrammarPointDetailView point={point} resolved={resolved} />
}
