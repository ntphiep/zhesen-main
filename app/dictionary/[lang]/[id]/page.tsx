import { notFound } from 'next/navigation'
import { getCachedEntryDetail } from '@/lib/dictionary/cached'
import { buildEntryId } from '@/lib/dictionary/entryId'
import { entryMetadata } from '@/lib/dictionary/entryMetadata'
import { LookupView } from '@/components/lookup/LookupView'
import { BreadcrumbJsonLd } from '@/components/seo/BreadcrumbJsonLd'
import { loadWordPage } from '@/lib/dictionary/wordPageData'
import { isLangCode } from '@/lib/languages'
import { percentDecode } from '@/lib/http/percentDecode'
import type { Metadata } from 'next'

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
 * stored and served from the edge, on the same window the data caches use. See
 * `LEX_REVALIDATE` for why that window is a week and not an hour.
 */
// One week, the literal value of `LEX_REVALIDATE` in `lib/dictionary/cached.ts`,
// which the data caches under this page use and which explains the figure. Written
// out because a segment config must be statically analysable: importing the constant
// fails the build with "Invalid segment configuration export detected".
export const revalidate = 604800


type Params = Promise<{ lang: string; id: string }>

/**
 * A dictionary entry is the page people arrive at from a search engine, so the
 * title has to be the word itself rather than the site name. Both this and the
 * page body read `getCachedEntryDetail`, which React `cache` memoises per request,
 * so the second read costs nothing.
 */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang, id } = await params
  if (!isLangCode(lang)) return {}
  const detail = await getCachedEntryDetail(buildEntryId(lang, percentDecode(id)))
  return detail ? entryMetadata(detail) : {}
}

export default async function Page({ params }: { params: Params }) {
  const { lang, id } = await params
  if (!isLangCode(lang)) notFound()
  const data = await loadWordPage(buildEntryId(lang, percentDecode(id)))
  if (!data) notFound()
  return (
    <>
      <BreadcrumbJsonLd trail={[{ name: 'Từ điển', path: '/dictionary' }, { name: data.detail.headword }]} />
      <LookupView {...data} />
    </>
  )
}
