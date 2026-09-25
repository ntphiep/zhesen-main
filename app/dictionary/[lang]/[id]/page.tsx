import { notFound } from 'next/navigation'
import { getCachedEntryDetail, getCachedCrossLanguage, getCachedCharacters, getCachedInflections, getCachedEntriesContaining, getCachedTermPreviews, getCachedTappableTexts, getCachedWordKin } from '@/lib/dictionary/cached'
import { getCachedGrammarPointsForEntry } from '@/lib/grammar/cached'
import { buildEntryId, entryPath } from '@/lib/dictionary/entryId'
import { LookupView } from '@/components/lookup/LookupView'
import { groupWordForms } from '@/lib/dictionary/family'
import { pickExamples } from '@/lib/dictionary/textQuality'
import { lemmaFromSenses } from '@/lib/dictionary/lemma'
import { getLanguage, isLangCode } from '@/lib/languages'
import { percentDecode } from '@/lib/http/percentDecode'
import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/site'

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
 * page body read `getCachedEntryDetail`, which is an `unstable_cache` call, so
 * the second read costs nothing.
 */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang, id } = await params
  if (!isLangCode(lang)) return {}
  const detail = await getCachedEntryDetail(buildEntryId(lang, percentDecode(id)))
  if (!detail) return {}
  const language = getLanguage(lang)
  const glosses = detail.senses
    .map((s) => s.glossVi ?? s.pivotVi ?? s.glossEn)
    .filter((g): g is string => Boolean(g))
    .slice(0, 3)
    .join('; ')
  return pageMetadata({
    title: `${detail.headword} · ${language?.name ?? lang}`,
    description: glosses
      ? `${detail.headword} nghĩa là ${glosses}.`
      : `Xem nghĩa, phát âm và ví dụ của ${detail.headword}.`,
    canonical: entryPath(detail.id),
  })
}

export default async function Page({ params }: { params: Params }) {
  const { lang, id } = await params
  if (!isLangCode(lang)) notFound()
  const entryId = buildEntryId(lang, percentDecode(id))

  const detail = await getCachedEntryDetail(entryId)
  if (!detail) notFound()

  // The word this entry is a form of, resolved through the same preview call as
  // the related words so an inflected page is not a dead end. It only reads
  // `detail`, so it does not have to wait for the queries below.
  const lemma = lemmaFromSenses(detail.senses, detail.headword)

  const [characters, siblings, inflections, grammarPoints, containing, kin, resolvedExamples] = await Promise.all([
    detail.lang === 'zh' ? getCachedCharacters(detail.headword) : Promise.resolve([]),
    getCachedCrossLanguage(entryId),
    getCachedInflections(entryId),
    getCachedGrammarPointsForEntry(entryId),
    getCachedEntriesContaining(detail.lang, detail.headword),
    // The stem the derived words hang off: the lemma when this entry is a form of
    // something else, otherwise the headword itself. Chinese is left out because a
    // prefix of a Chinese headword is a compound, which `containing` already answers.
    detail.lang === 'zh'
      ? Promise.resolve([])
      : getCachedWordKin(detail.lang, lemma ?? detail.headword, detail.headword),
    // Resolve the example sentences here rather than letting each one do it from
    // the browser. Done there, a Chinese entry issued eighteen requests and showed
    // nothing until the last returned; done here the sentences are in the HTML.
    //
    // In this wave rather than the next one: it reads `detail.examples` and
    // nothing the queries above return, so waiting for them bought nothing while
    // adding its own round trip to the page's critical path. Measured against
    // production on a first visit, the sentences of `en:quickly` took 680 ms and
    // `zh:朋友` 716 ms, all of it after the wave above had already finished.
    getCachedTappableTexts(detail.lang, pickExamples(detail.examples).map((e) => e.text)),
  ])

  // The related words and the inflected forms are stored as bare text, so one more
  // call turns them into rows a learner can read. It runs after the two lists are
  // known, and is cached on their contents.
  const terms = [
    ...detail.relations.map((r) => r.relatedText ?? ''),
    ...groupWordForms(inflections).map((f) => f.text),
    ...(lemma ? [lemma] : []),
  ]
  const previewRows = await getCachedTermPreviews(detail.lang, terms)
  const previews = Object.fromEntries(previewRows.map((p) => [p.matchText.toLowerCase(), p]))

  return (
    <LookupView
      detail={detail}
      lemma={lemma}
      characters={characters}
      siblings={siblings}
      inflections={inflections}
      grammarPoints={grammarPoints}
      containing={containing}
      kin={kin}
      previews={previews}
      resolvedExamples={resolvedExamples}
    />
  )
}
