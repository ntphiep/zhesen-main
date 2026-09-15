import { notFound } from 'next/navigation'
import { getCachedEntryDetail, getCachedCrossLanguage, getCachedCharacters, getCachedInflections, getCachedEntriesContaining, getCachedTermPreviews, getCachedTappableTexts } from '@/lib/dictionary/cached'
import { getCachedGrammarPointsForEntry } from '@/lib/grammar/cached'
import { buildEntryId } from '@/lib/dictionary/entryId'
import { LookupView } from '@/components/lookup/LookupView'
import { groupWordForms } from '@/lib/dictionary/family'
import { pickExamples } from '@/lib/dictionary/textQuality'
import { lemmaFromSenses } from '@/lib/dictionary/lemma'
import { isLangCode } from '@/lib/languages'

export default async function Page({ params }: { params: Promise<{ lang: string; id: string }> }) {
  const { lang, id } = await params
  if (!isLangCode(lang)) notFound()
  const entryId = buildEntryId(lang, decodeURIComponent(id))

  const detail = await getCachedEntryDetail(entryId)
  if (!detail) notFound()

  const [characters, siblings, inflections, grammarPoints, containing] = await Promise.all([
    detail.lang === 'zh' ? getCachedCharacters(detail.headword) : Promise.resolve([]),
    getCachedCrossLanguage(entryId),
    getCachedInflections(entryId),
    getCachedGrammarPointsForEntry(entryId),
    getCachedEntriesContaining(detail.lang, detail.headword),
  ])

  // The related words and the inflected forms are stored as bare text, so one more
  // call turns them into rows a learner can read. It runs after the two lists are
  // known, and is cached on their contents.
  // The word this entry is a form of, resolved through the same preview call as
  // the related words so an inflected page is not a dead end.
  const lemma = lemmaFromSenses(detail.senses, detail.headword)
  const terms = [
    ...detail.relations.map((r) => r.relatedText ?? ''),
    ...groupWordForms(inflections).map((f) => f.text),
    ...(lemma ? [lemma] : []),
  ]
  const [previewRows, resolvedExamples] = await Promise.all([
    getCachedTermPreviews(detail.lang, terms),
    // Resolve the example sentences here rather than letting each one do it from
    // the browser. Done there, a Chinese entry issued eighteen requests and showed
    // nothing until the last returned; done here the sentences are in the HTML.
    getCachedTappableTexts(detail.lang, pickExamples(detail.examples).map((e) => e.text)),
  ])
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
      previews={previews}
      resolvedExamples={resolvedExamples}
    />
  )
}
