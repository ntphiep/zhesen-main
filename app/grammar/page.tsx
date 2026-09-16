import { LANGUAGES } from '@/lib/languages'
import { getCachedGrammarLangCounts } from '@/lib/grammar/cached'
import { GrammarLangList } from '@/components/grammar/GrammarLangList'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Ngữ pháp',
  description: 'Điểm ngữ pháp theo trình độ cho tiếng Trung, Tây Ban Nha và Anh.',
})

export default async function GrammarPage() {
  const counts = await getCachedGrammarLangCounts()
  return <GrammarLangList languages={LANGUAGES} counts={counts} />
}
