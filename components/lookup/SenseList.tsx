'use client'
import { useState } from 'react'
import Link from 'next/link'
import { pickSenses, parseClassifiers, isSentenceTranslation } from '@/lib/dictionary/textQuality'
import { senseSections, SHOWN_SENSES, type SenseSection } from '@/lib/dictionary/wordPage'
import { findWordClass } from '@/lib/theory/content'
import { wordClassPath } from '@/lib/theory/path'
import { AudioButton } from '@/components/ui/AudioButton'
import { useAnchor } from '@/lib/hooks/useAnchor'
import { TappableText } from '@/components/reader/TappableText'
import { Badge, EnglishMark, MoreButton, PivotMark, UntranslatedNote, WordLink } from './WordParts'
import type { ResolvedText } from '@/lib/dictionary/tappable'
import type { DictExample, DictSense } from '@/lib/dictionary/types'
import type { SenseSynonyms, ViewWord } from '@/lib/dictionary/wordView'
import type { LangCode } from '@/lib/languages'

interface Shared {
  lang: LangCode
  examples: Record<string, DictExample>
  byText: Map<string, ResolvedText>
  glosses: (string | null)[]
  synonyms: Map<number, ViewWord[]>
  mark: string[]
}

function Sense({ s, n, more, lang, examples, byText, glosses, synonyms, mark }: Shared & { s: DictSense; n: number; more: boolean }) {
  const example = s.id ? examples[s.id] : undefined
  const words = synonyms.get(s.senseOrder) ?? []
  const vi = s.glossVi ?? s.pivotVi
  return (
    <li data-more={more || undefined} className="flex gap-2.5">
      <span className="w-5 shrink-0 text-[15px] font-semibold text-(--zs-soft)">{n}.</span>
      <div className="flex min-w-0 flex-col gap-1.5">
        {/* 25.3% of English senses have no Vietnamese gloss. There the English is the
            meaning, so it takes the meaning's place, marked as English. */}
        {vi || s.glossEn
          ? <span className="font-semibold">{vi ?? s.glossEn}{!s.glossVi && s.pivotVi && <PivotMark />}{!vi && <EnglishMark />}</span>
          : <span className="italic text-(--zs-soft)">(chưa có nghĩa)</span>}
        {s.glossEn && vi && <span className="text-xs text-(--zs-soft)">{s.glossEn}</span>}
        {example && (
          <div className="mt-1 flex flex-col gap-0.5 border-l-2 border-sea-300 pl-3">
            <span className="flex items-center gap-1 text-[15px]">
              <span><TappableText text={example.text} lang={lang} resolved={byText.get(example.text)} quiet mark={mark} /></span>
              <AudioButton text={example.text} lang={lang} />
            </span>
            {isSentenceTranslation(example.translationVi, glosses) && (
              <span className="text-[13px] text-(--zs-soft)">{example.translationVi}</span>
            )}
          </div>
        )}
        {words.length > 0 && (
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <Badge tone="light">Đồng nghĩa</Badge>
            {words.map((w, i) => (
              <span key={w.text}>
                {i > 0 && <span aria-hidden="true" className="mr-2 text-sea-300">·</span>}
                <WordLink word={w} className="text-(--zs-pen) hover:underline" />
              </span>
            ))}
          </p>
        )}
      </div>
    </li>
  )
}

function PosSection({ section, ...shared }: Shared & { section: SenseSection }) {
  const [expanded, setExpanded] = useState(false)
  const { shown, hiddenCount } = pickSenses(section.senses, SHOWN_SENSES)
  const visible = expanded ? section.senses : shown
  const documented = section.key && findWordClass(shared.lang, section.key)
  const anchor = useAnchor()
  return (
    <section id={anchor(section.anchor)} data-reveal="" className="flex flex-col gap-4">
      <div className="flex items-baseline gap-2.5 border-b border-(--zs-line) pb-2.5">
        <h2 className="text-lg font-extrabold tracking-[-0.01em]">
          {documented
            ? <Link href={wordClassPath(shared.lang, section.key)} className="hover:underline">{section.labelVi}</Link>
            : section.labelVi}
        </h2>
        <span className="text-[13px] text-(--zs-soft)">{section.senses.length} nghĩa</span>
      </div>
      <ol className="flex flex-col gap-5">
        {visible.map((s, i) => <Sense key={s.id ?? `${s.senseOrder}-${i}`} s={s} n={i + 1} more={expanded && !shown.includes(s)} {...shared} />)}
      </ol>
      {hiddenCount > 0 && (
        <MoreButton
          expanded={expanded}
          label={`Xem thêm ${hiddenCount} nghĩa ${section.key ? section.labelVi.toLocaleLowerCase('vi') : 'khác'}`}
          onClick={() => setExpanded((v) => !v)}
        />
      )}
    </section>
  )
}

/** One section per part of speech, each showing its most used senses with one example
 *  apiece and the synonyms of that sense, expanding in place. */
export function SenseList({ senses, lang, examples = {}, resolved = [], glosses = [], senseSynonyms = [], mark = [] }: {
  senses: DictSense[]
  lang: LangCode
  /** The example shown under each sense, keyed by sense id; see planExamples. */
  examples?: Record<string, DictExample>
  resolved?: ResolvedText[]
  glosses?: (string | null)[]
  senseSynonyms?: SenseSynonyms[]
  /** Lower-case words set in bold in the examples: the headword and its forms. */
  mark?: string[]
}) {
  // Chinese entries carry CC-CEDICT "CL:" rows that are classifier notes, not
  // meanings, so they belong on a "Lượng từ" line and not in the numbered list.
  const classifiers = [...new Set(senses.flatMap((s) => parseClassifiers(s.glossEn)))]
  const sections = senseSections(senses)
  if (sections.length === 0 && classifiers.length === 0) return null
  const byText = new Map(resolved.map((r) => [r.text, r]))
  const synonyms = new Map(senseSynonyms.map((s) => [s.senseOrder, s.words]))

  return (
    <div className="flex flex-col gap-10">
      <UntranslatedNote senses={senses} />
      {sections.map((sec) => (
        <PosSection
          key={sec.key} section={sec} lang={lang} examples={examples} byText={byText} glosses={glosses}
          synonyms={synonyms} mark={mark}
        />
      ))}
      {classifiers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs font-bold tracking-[0.02em] text-(--zs-soft)">Lượng từ</span>
          {classifiers.map((c) => (
            <span key={c} className="rounded-full bg-(--zs-chip) px-3 py-1 font-medium text-(--zs-ink)">{c}</span>
          ))}
        </div>
      )}
    </div>
  )
}
