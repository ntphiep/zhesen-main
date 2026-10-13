import { LANGUAGES } from '@/lib/languages'
import { getCachedGrammarLangCounts } from '@/lib/grammar/cached'
import { TheoryLangList } from '@/components/theory/TheoryLangList'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Lý thuyết',
  description: 'Học ngữ pháp và từ vựng tiếng Anh, tiếng Tây Ban Nha và tiếng Trung, cùng phát âm và collocation tiếng Anh.',
})

export default async function TheoryPage() {
  const counts = await getCachedGrammarLangCounts()
  return <TheoryLangList languages={LANGUAGES} grammarCounts={counts} />
}
