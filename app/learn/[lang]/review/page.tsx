import { notFound } from 'next/navigation'
import { getContentSource } from '@/lib/content'
import type { LangCode } from '@/lib/content/types'
import { ReviewSession } from './ReviewSession'

const VALID: LangCode[] = ['zh', 'es', 'en']

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!VALID.includes(lang as LangCode)) notFound()
  const code = lang as LangCode
  const vocab = await getContentSource().getVocabByLang(code)
  return <ReviewSession lang={code} vocab={vocab} />
}
