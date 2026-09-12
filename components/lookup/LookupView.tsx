import Link from 'next/link'
import { LookupHero } from './LookupHero'
import { SenseList } from './SenseList'
import { CharacterPanel } from './CharacterPanel'
import { WordFamily } from './WordFamily'
import { RelatedWords } from './RelatedWords'
import { CrossLanguagePanel } from './CrossLanguagePanel'
import { ConjugationTable } from './ConjugationTable'
import { ExampleList } from './ExampleList'
import { GrammarLinks } from './GrammarLinks'
import { groupWordForms } from '@/lib/dictionary/family'
import { buildConjugation } from '@/lib/dictionary/conjugation'
import type { DictEntryDetail, CharInfo, CrossLangSibling, WordForm } from '@/lib/dictionary/types'
import type { GrammarPoint } from '@/lib/grammar/types'

/**
 * Two-column lookup layout (hanzii-style): the hero spans the top, then a wide
 * main column holds the dense content (meanings, character breakdown, conjugation,
 * examples) and a narrower side rail holds the link lists (other languages, related
 * words, word forms). Collapses to a single column below `lg`.
 */
export function LookupView({ detail, characters, siblings, inflections = [], grammarPoints = [] }: {
  detail: DictEntryDetail
  characters: CharInfo[]
  siblings: CrossLangSibling[]
  inflections?: WordForm[]
  grammarPoints?: GrammarPoint[]
}) {
  const hanViet = characters.map((c) => c.hanViet[0]).filter(Boolean).join(' ') || null
  // Spanish verbs get a conjugation table; for them the flat "word family" chip list
  // would be hundreds of inflected forms, so we suppress it in favour of the table.
  const conjugation = detail.lang === 'es' ? buildConjugation(inflections) : null
  const forms = conjugation ? [] : groupWordForms(inflections)

  const showChars = detail.lang === 'zh' && characters.length > 0
  const hasSideRail = showChars || siblings.length > 0 || detail.relations.length > 0 || forms.length > 0 || grammarPoints.length > 0

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
      <Link href="/dictionary" className="text-sm text-black/50 hover:underline">← Tra cứu</Link>
      <LookupHero detail={detail} hanViet={detail.lang === 'zh' ? hanViet : null} />

      <div className={hasSideRail ? 'grid gap-x-10 gap-y-8 lg:grid-cols-3' : 'flex flex-col gap-8'}>
        <div className="flex flex-col gap-8 lg:col-span-2">
          <SenseList senses={detail.senses} />
          {conjugation && <ConjugationTable conjugation={conjugation} />}
          <ExampleList examples={detail.examples} lang={detail.lang} />
        </div>

        {hasSideRail && (
          <aside className="flex flex-col gap-8">
            {showChars && <CharacterPanel characters={characters} />}
            <CrossLanguagePanel siblings={siblings} />
            <RelatedWords relations={detail.relations} lang={detail.lang} />
            <WordFamily headword={detail.headword} forms={forms} lang={detail.lang} />
            <GrammarLinks points={grammarPoints} />
          </aside>
        )}
      </div>
    </main>
  )
}
