'use client'
import { useState } from 'react'
import Link from 'next/link'
import { pickSenses, parseClassifiers, isSentenceTranslation } from '@/lib/dictionary/textQuality'
import { senseSections, SHOWN_SENSES, type SenseSection } from '@/lib/dictionary/wordPage'
import { findWordClass } from '@/lib/theory/content'
import { wordClassPath } from '@/lib/theory/path'
import { AudioButton } from '@/components/ui/AudioButton'
import { TappableText } from '@/components/reader/TappableText'
import type { ResolvedText } from '@/lib/dictionary/tappable'
import type { DictExample, DictSense } from '@/lib/dictionary/types'
import type { LangCode } from '@/lib/languages'

interface Shared {
  lang: LangCode
  examples: Record<string, DictExample>
  byText: Map<string, ResolvedText>
  glosses: (string | null)[]
}

function Sense({ s, n, lang, examples, byText, glosses }: Shared & { s: DictSense; n: number }) {
  const example = s.id ? examples[s.id] : undefined
  return (
    <li className="flex gap-2">
      <span className="w-5 shrink-0 text-right text-black/40">{n}.</span>
      <div className="flex min-w-0 flex-col gap-1">
        <div>
          {s.glossVi
            ? <span className="font-medium text-black/85">{s.glossVi}</span>
            : s.pivotVi ? (
              <span className="font-medium text-black/85">
                {s.pivotVi}
                <span className="ml-1 align-middle text-[10px] font-normal uppercase tracking-wide text-amber-700/70" title="Nghĩa suy ra qua tiếng Anh">qua tiếng Anh</span>
              </span>
            ) : (
              // 25.3% of English senses have no Vietnamese gloss. There the English
              // is the meaning, so it takes the meaning's place.
              s.glossEn && <span className="font-medium text-black/85">{s.glossEn}</span>
            )}
          {/* On its own line and smaller: on a Vietnamese page the English gloss is
              a cross-check, not a second meaning; inline the two ran together. */}
          {s.glossEn && (s.glossVi || s.pivotVi) && (
            <span className="mt-0.5 block text-xs text-black/45">{s.glossEn}</span>
          )}
          {!s.glossVi && !s.pivotVi && !s.glossEn && <span className="italic text-black/30">(chưa có nghĩa)</span>}
        </div>
        {example && (
          <div className="flex flex-col border-l-2 border-blue-600/60 pl-3">
            <div className="flex items-center gap-1">
              <span className="text-black/80">
                <TappableText text={example.text} lang={lang} resolved={byText.get(example.text)} />
              </span>
              <AudioButton text={example.text} lang={lang} />
            </div>
            {isSentenceTranslation(example.translationVi, glosses) && (
              <p className="text-sm text-black/50">{example.translationVi}</p>
            )}
          </div>
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
  return (
    <section id={section.anchor} className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2 border-b border-black/10 pb-2">
        <h2 className="text-lg font-semibold">
          {documented
            ? <Link href={wordClassPath(shared.lang, section.key)} className="hover:underline">{section.labelVi}</Link>
            : section.labelVi}
        </h2>
        <span className="text-sm text-black/45">{section.senses.length} nghĩa</span>
      </div>
      <ol className="flex flex-col gap-4">
        {visible.map((s, i) => <Sense key={s.id ?? `${s.senseOrder}-${i}`} s={s} n={i + 1} {...shared} />)}
      </ol>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="w-fit text-sm font-medium text-blue-700 hover:underline"
        >
          {expanded
            ? 'Thu gọn'
            : `+ ${hiddenCount} nghĩa ${section.key ? `${section.labelVi.toLocaleLowerCase('vi')} ` : ''}khác`}
        </button>
      )}
    </section>
  )
}

/** One section per part of speech, each showing its most used senses with one example
 *  apiece and expanding in place. */
export function SenseList({ senses, lang, examples = {}, resolved = [], glosses = [] }: {
  senses: DictSense[]
  lang: LangCode
  /** The example shown under each sense, keyed by sense id; see planExamples. */
  examples?: Record<string, DictExample>
  resolved?: ResolvedText[]
  glosses?: (string | null)[]
}) {
  // Chinese entries carry CC-CEDICT "CL:" rows that are classifier notes, not
  // meanings, so they belong on a "Lượng từ" line and not in the numbered list.
  const classifiers = [...new Set(senses.flatMap((s) => parseClassifiers(s.glossEn)))]
  const sections = senseSections(senses)
  if (sections.length === 0 && classifiers.length === 0) return null
  const byText = new Map(resolved.map((r) => [r.text, r]))

  return (
    <div className="flex flex-col gap-8">
      {sections.map((sec) => (
        <PosSection key={sec.key} section={sec} lang={lang} examples={examples} byText={byText} glosses={glosses} />
      ))}
      {classifiers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-black/40">Lượng từ</span>
          {classifiers.map((c) => (
            <span key={c} className="rounded-full bg-black/5 px-3 py-1 font-medium text-black/80">{c}</span>
          ))}
        </div>
      )}
    </div>
  )
}
