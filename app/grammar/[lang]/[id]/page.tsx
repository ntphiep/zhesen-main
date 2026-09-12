import { notFound } from 'next/navigation'
import { isLangCode } from '@/lib/languages'
import { getCachedGrammarPointDetail } from '@/lib/grammar/cached'
import { buildGrammarPointId } from '@/lib/grammar/path'
import { GrammarPointDetailView } from '@/components/grammar/GrammarPointDetailView'

export default async function GrammarPointPage({ params }: { params: Promise<{ lang: string; id: string }> }) {
  const { lang, id } = await params
  if (!isLangCode(lang)) notFound()
  const pointId = buildGrammarPointId(lang, decodeURIComponent(id))

  const point = await getCachedGrammarPointDetail(pointId)
  if (!point) notFound()

  return <GrammarPointDetailView point={point} />
}
