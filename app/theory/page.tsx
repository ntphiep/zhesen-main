import { LANGUAGES } from '@/lib/languages'
import { getCachedGrammarLangCounts } from '@/lib/grammar/cached'
import { TheoryLangList } from '@/components/theory/TheoryLangList'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Lý thuyết',
  description: 'Học phát âm, từ loại, câu, ngữ pháp và collocation tiếng Trung, Tây Ban Nha và Anh.',
})

export default async function TheoryPage() {
  const counts = await getCachedGrammarLangCounts()
  return <TheoryLangList languages={LANGUAGES} grammarCounts={counts} />
}
