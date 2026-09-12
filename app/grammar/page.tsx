import { LANGUAGES } from '@/lib/languages'
import { getCachedGrammarLangCounts } from '@/lib/grammar/cached'
import { GrammarLangList } from '@/components/grammar/GrammarLangList'

export default async function GrammarPage() {
  const counts = await getCachedGrammarLangCounts()
  return <GrammarLangList languages={LANGUAGES} counts={counts} />
}
