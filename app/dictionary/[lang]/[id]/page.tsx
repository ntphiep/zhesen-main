import { notFound } from 'next/navigation'
import { getCachedEntryDetail, getCachedCrossLanguage, getCachedCharacters } from '@/lib/dictionary/cached'
import { buildEntryId } from '@/lib/dictionary/entryId'
import { LookupView } from '@/components/lookup/LookupView'
import type { LangCode } from '@/lib/content/types'

const VALID: LangCode[] = ['zh', 'es', 'en']

export default async function Page({ params }: { params: Promise<{ lang: string; id: string }> }) {
  const { lang, id } = await params
  if (!VALID.includes(lang as LangCode)) notFound()
  const langCode = lang as LangCode
  const entryId = buildEntryId(langCode, decodeURIComponent(id))

  const detail = await getCachedEntryDetail(entryId)
  if (!detail) notFound()

  const [characters, siblings] = await Promise.all([
    detail.lang === 'zh' ? getCachedCharacters(detail.headword) : Promise.resolve([]),
    getCachedCrossLanguage(entryId),
  ])

  return <LookupView detail={detail} characters={characters} siblings={siblings} />
}
