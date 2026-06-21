import Link from 'next/link'
import { LookupHero } from './LookupHero'
import { SenseList } from './SenseList'
import { CharacterPanel } from './CharacterPanel'
import { WordFamily } from './WordFamily'
import { RelatedWords } from './RelatedWords'
import { CrossLanguagePanel } from './CrossLanguagePanel'
import { ConjugationTable } from './ConjugationTable'
import { ExampleList } from './ExampleList'
import { groupWordForms } from '@/lib/dictionary/family'
import { buildConjugation } from '@/lib/dictionary/conjugation'
import type { DictEntryDetail, CharInfo, CrossLangSibling, WordForm } from '@/lib/dictionary/types'

export function LookupView({ detail, characters, siblings, inflections = [] }: {
  detail: DictEntryDetail
  characters: CharInfo[]
  siblings: CrossLangSibling[]
  inflections?: WordForm[]
}) {
  const hanViet = characters.map((c) => c.hanViet[0]).filter(Boolean).join(' ') || null
  // Spanish verbs get a conjugation table; for them the flat "word family" chip list
  // would be hundreds of inflected forms, so we suppress it in favour of the table.
  const conjugation = detail.lang === 'es' ? buildConjugation(inflections) : null
  const forms = conjugation ? [] : groupWordForms(inflections)
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
      <Link href="/dictionary" className="text-sm text-black/50 hover:underline">← Tra cứu</Link>
      <LookupHero detail={detail} hanViet={detail.lang === 'zh' ? hanViet : null} />
      <SenseList senses={detail.senses} />
      {detail.lang === 'zh' && <CharacterPanel characters={characters} />}
      {conjugation && <ConjugationTable conjugation={conjugation} />}
      <WordFamily headword={detail.headword} forms={forms} lang={detail.lang} />
      <RelatedWords relations={detail.relations} lang={detail.lang} />
      <CrossLanguagePanel siblings={siblings} />
      <ExampleList examples={detail.examples} lang={detail.lang} />
    </main>
  )
}
