import Link from 'next/link'
import { LookupHero } from './LookupHero'
import { SenseList } from './SenseList'
import { CharacterPanel } from './CharacterPanel'
import { RelatedTabs } from './RelatedTabs'
import { CrossLanguagePanel } from './CrossLanguagePanel'
import { ConjugationTable } from './ConjugationTable'
import { ExampleList } from './ExampleList'
import { GrammarLinks } from './GrammarLinks'
import { AiCoach } from '@/components/ai/AiCoach'
import { entryMeaningVi } from '@/lib/dictionary/textQuality'
import { groupWordForms } from '@/lib/dictionary/family'
import { entryGlosses, exampleCandidates, knownWordExamples, planExamples, relatedTabs, senseSections, summaryLine } from '@/lib/dictionary/wordPage'
import { searchPath } from '@/lib/dictionary/entryId'
import { LemmaLink } from '@/components/lookup/LemmaLink'
import { buildConjugation } from '@/lib/dictionary/conjugation'
import type { ResolvedText } from '@/lib/dictionary/tappable'
import type { ContainingWord, DictEntryPreview, DictEntryDetail, CharInfo, CrossLangSibling, TermPreview, WordForm } from '@/lib/dictionary/types'
import type { GrammarPoint } from '@/lib/grammar/types'

/**
 * The word page: the hero spans the top, the main column holds the meanings and their
 * examples, and the rail holds everything to look up next. On a phone the rail follows
 * the main column. The rail is not sticky: it is often longer than the viewport.
 */
export function LookupView({
  detail, lemma = null, characters, siblings, inflections = [], grammarPoints = [], containing = [], kin = [], previews = {},
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
  /** Entries built on the same stem, already filtered; see lib/dictionary/kin.ts. */
  kin?: DictEntryPreview[]
  /** What the dictionary knows about each related word, keyed by the lowercased
   *  surface form. Missing entries render without a meaning. */
  previews?: Record<string, TermPreview>
  /** Example sentences already resolved on the server; see lib/dictionary/tappable.ts. */
  resolvedExamples?: ResolvedText[]
}) {
  const hanViet = characters.map((c) => c.hanViet[0]).filter(Boolean).join(' ') || null
  // Spanish verbs get the table instead of the word-form line, which for them would run
  // to hundreds of inflected forms.
  const conjugation = detail.lang === 'es' ? buildConjugation(inflections) : null
  const allForms = groupWordForms(inflections)
  const forms = conjugation ? [] : allForms.filter((f) => f.standard && f.text.toLowerCase() !== detail.headword.toLowerCase())

  const sections = senseSections(detail.senses)
  const glosses = entryGlosses(detail)
  const candidates = knownWordExamples(exampleCandidates(sections, detail.examples), resolvedExamples, detail.lang)
  const plan = planExamples(sections, candidates, glosses)
  const exampleCount = Object.keys(plan.bySense).length + plan.others.length
  const tabs = relatedTabs({
    lang: detail.lang, headword: detail.headword, lemma, relations: detail.relations,
    containing, kin, formTexts: allForms.map((f) => f.text), previews,
  })
  const relatedCount = tabs.reduce((n, t) => n + t.items.length, 0)
  // Without any of these the rail holds at most the assistant, which then follows the
  // meanings instead of leaving a blank column beside them.
  const rail = forms.length > 0 || tabs.length > 0 || siblings.length > 0 || grammarPoints.length > 0
  const jumps = [
    ...sections.map((s) => ({ href: `#${s.anchor}`, label: `${s.labelVi} · ${s.senses.length}` })),
    ...(plan.others.length > 0 ? [{ href: '#examples', label: `Ví dụ · ${exampleCount}` }] : []),
    ...(relatedCount > 0 ? [{ href: '#related', label: `Từ liên quan · ${relatedCount}` }] : []),
  ]

  return (
    <main className="mx-auto flex w-full max-w-[1248px] flex-col gap-6 px-4 py-10 sm:px-6">
      <Link href="/dictionary" className="text-sm text-black/50 hover:underline">← Dịch</Link>
      <LookupHero detail={detail} hanViet={detail.lang === 'zh' ? hanViet : null} summary={summaryLine(sections)} jumps={jumps} />
      {lemma && <LemmaLink lemma={lemma} preview={previews[lemma.toLowerCase()]} lang={detail.lang} />}

      <div className={`grid grid-cols-1 gap-x-12 gap-y-8 lg:items-start ${rail ? 'lg:grid-cols-[minmax(0,1fr)_390px]' : ''}`}>
        <div className="flex min-w-0 flex-col gap-10">
          <SenseList senses={detail.senses} lang={detail.lang} examples={plan.bySense} resolved={resolvedExamples} glosses={glosses} />
          {/* Characters are the substance of a Chinese entry, not an appendix: radicals,
              stroke counts and writing practice do not fit the rail. */}
          {detail.lang === 'zh' && <CharacterPanel characters={characters} />}
          {conjugation && <ConjugationTable conjugation={conjugation} />}
          <ExampleList
            examples={plan.others}
            lang={detail.lang}
            resolved={resolvedExamples}
            glosses={glosses}
            title={exampleCount > plan.others.length ? 'Ví dụ khác' : 'Ví dụ'}
          />
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          {forms.length > 0 && (
            <section className="flex flex-col gap-2 rounded-xl border border-black/10 p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-black/55">Dạng từ</h2>
              <p className="flex flex-wrap gap-x-2 font-medium">
                {forms.map((f, i) => (
                  <span key={f.text}>
                    <Link href={searchPath(detail.lang, f.text)} title={f.label} className="hover:underline">{f.text}</Link>
                    {i < forms.length - 1 && <span aria-hidden="true" className="ml-2 text-black/30">·</span>}
                  </span>
                ))}
              </p>
            </section>
          )}
          <RelatedTabs tabs={tabs} />
          <CrossLanguagePanel siblings={siblings} />
          <GrammarLinks points={grammarPoints} rail />
          {/* Under the dictionary's own material, never in place of it: what the assistant
              says is generated, what is above it is sourced. Hidden while AiCoach renders
              nothing, which it does where the assistant is off. */}
          <section className="flex flex-col gap-2 rounded-xl bg-black/[0.03] p-4 [&:has(>div:empty)]:hidden">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-black/55">Trợ lý</h2>
            <div>
              <AiCoach lang={detail.lang} headword={detail.headword} meaningVi={entryMeaningVi(detail)} />
            </div>
          </section>
        </aside>
      </div>
    </main>
  )
}
