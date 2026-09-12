import { notFound } from 'next/navigation'
import { getCachedEntryDetail, getCachedCrossLanguage, getCachedCharacters, getCachedInflections, getCachedEntriesContaining, getCachedTermPreviews } from '@/lib/dictionary/cached'
import { getCachedGrammarPointsForEntry } from '@/lib/grammar/cached'
import { buildEntryId } from '@/lib/dictionary/entryId'
import { LookupView } from '@/components/lookup/LookupView'
import { groupWordForms } from '@/lib/dictionary/family'
import type { LangCode } from '@/lib/languages'

const VALID: LangCode[] = ['zh', 'es', 'en']

export default async function Page({ params }: { params: Promise<{ lang: string; id: string }> }) {
  const { lang, id } = await params
  if (!VALID.includes(lang as LangCode)) notFound()
  const langCode = lang as LangCode
  const entryId = buildEntryId(langCode, decodeURIComponent(id))

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
  const terms = [
    ...detail.relations.map((r) => r.relatedText ?? ''),
    ...groupWordForms(inflections).map((f) => f.text),
  ]
  const previews = Object.fromEntries(
    (await getCachedTermPreviews(detail.lang, terms)).map((p) => [p.matchText.toLowerCase(), p]),
  )

  return (
    <LookupView
      detail={detail}
      characters={characters}
      siblings={siblings}
      inflections={inflections}
      grammarPoints={grammarPoints}
      containing={containing}
      previews={previews}
    />
  )
}
