import Link from 'next/link'
import { LookupHero } from './LookupHero'
import { SenseList } from './SenseList'
import { CharacterPanel } from './CharacterPanel'
import { WordFamily } from './WordFamily'
import { RelatedWords } from './RelatedWords'
import { ContainingWords } from './ContainingWords'
import { CrossLanguagePanel } from './CrossLanguagePanel'
import { ConjugationTable } from './ConjugationTable'
import { ExampleList } from './ExampleList'
import { GrammarLinks } from './GrammarLinks'
import { AiCoach } from '@/components/ai/AiCoach'
import { entryMeaningVi } from '@/lib/dictionary/textQuality'
import { groupWordForms } from '@/lib/dictionary/family'
import { LemmaLink } from '@/components/lookup/LemmaLink'
import { buildConjugation } from '@/lib/dictionary/conjugation'
import type { ResolvedText } from '@/lib/dictionary/tappable'
import type { ContainingWord, DictEntryDetail, CharInfo, CrossLangSibling, TermPreview, WordForm } from '@/lib/dictionary/types'
import type { GrammarPoint } from '@/lib/grammar/types'

/**
 * Two-column lookup layout (hanzii-style): the hero spans the top, then a wide
 * main column holds the dense content (meanings, character breakdown, conjugation,
 * examples, the related-word and word-form tables) and a narrower side rail holds
 * the link lists (other languages, compounds, grammar). Collapses to a single
 * column below `lg`.
 *
 * The related words and the word family moved out of the rail when they stopped
 * being chips: each row now carries a part of speech and a meaning, which does not
 * fit a 320px column.
 */
export function LookupView({
  detail, lemma = null, characters, siblings, inflections = [], grammarPoints = [], containing = [], previews = {},
  resolvedExamples = [],
}: {
  detail: DictEntryDetail
  characters: CharInfo[]
  /** The headword this entry is an inflected form of, when it is one. */
  lemma?: string | null
  siblings: CrossLangSibling[]
  inflections?: WordForm[]
  grammarPoints?: GrammarPoint[]
  containing?: ContainingWord[]
  /** What the dictionary knows about each related word and inflected form, keyed
   *  by the lowercased surface form. Missing entries render as plain text. */
  previews?: Record<string, TermPreview>
  /** Example sentences already resolved on the server; see lib/dictionary/tappable.ts. */
  resolvedExamples?: ResolvedText[]
}) {
  const hanViet = characters.map((c) => c.hanViet[0]).filter(Boolean).join(' ') || null
  // Spanish verbs get a conjugation table; for them the flat "word family" chip list
  // would be hundreds of inflected forms, so we suppress it in favour of the table.
  const conjugation = detail.lang === 'es' ? buildConjugation(inflections) : null
  const forms = conjugation ? [] : groupWordForms(inflections)

  const showChars = detail.lang === 'zh' && characters.length > 0
  const hasSideRail = showChars || siblings.length > 0 || grammarPoints.length > 0 || containing.length > 0

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
      <Link href="/dictionary" className="text-sm text-black/50 hover:underline">← Tra cứu</Link>
      <LookupHero detail={detail} hanViet={detail.lang === 'zh' ? hanViet : null} />
      {lemma && <LemmaLink lemma={lemma} preview={previews[lemma.toLowerCase()]} lang={detail.lang} />}

      {/* Three blocks, in the order they matter on a phone: what the word means,
          then the links across languages, then the reference material. On a wide
          screen the grid puts the first two side by side and drops the third
          underneath, which also stops the rail from stranding content in a column
          that ends two thirds of the way up the page. */}
      <div className={hasSideRail ? 'grid gap-x-10 gap-y-8 lg:grid-cols-3' : 'flex flex-col gap-8'}>
        <div className="flex flex-col gap-8 lg:col-span-2">
          <SenseList senses={detail.senses} />
          {/* Characters are the substance of a Chinese entry, not an appendix:
              radicals, stroke counts and the writing practice belong in the wide
              column, where they were squeezed into a 299px rail before. */}
          {showChars && <CharacterPanel characters={characters} />}
          <ExampleList
            examples={detail.examples}
            lang={detail.lang}
            resolved={resolvedExamples}
            glosses={[detail.glossVi, ...detail.senses.map((s) => s.glossVi)]}
          />
          {/* Under the dictionary's own material, never in place of it: what the
              assistant says is generated, what is above it is sourced. */}
          <AiCoach lang={detail.lang} headword={detail.headword} meaningVi={entryMeaningVi(detail)} />
        </div>

        {hasSideRail && (
          <aside className="flex flex-col gap-8">
            <CrossLanguagePanel siblings={siblings} />
            <ContainingWords words={containing} lang={detail.lang} />
            <GrammarLinks points={grammarPoints} />
          </aside>
        )}

        <div className="flex flex-col gap-8 lg:col-span-2">
          {conjugation && <ConjugationTable conjugation={conjugation} />}
          <WordFamily headword={detail.headword} forms={forms} previews={previews} lang={detail.lang} />
          <RelatedWords relations={detail.relations} previews={previews} lang={detail.lang} />
        </div>
      </div>
    </main>
  )
}
