import { useState } from 'react'
import Link from 'next/link'
import { Pronunciation } from './Pronunciation'
import { AddToWordlistButton } from './AddToWordlistButton'
import { CharacterPanel } from './CharacterPanel'
import { ConjugationTable } from './ConjugationTable'
import { GrammarLinks } from './GrammarLinks'
import { LemmaLink } from './LemmaLink'
import { AiCorner, FormText, LevelChip, MorphText, WordChip, WordLink, frequencyBars } from './WordParts'
import { AudioButton } from '@/components/ui/AudioButton'
import { PosTag } from '@/components/ui/PosTag'
import { TappableText } from '@/components/reader/TappableText'
import { entryPath, searchPath } from '@/lib/dictionary/entryId'
import { LANG_LABELS } from '@/lib/dictionary/labels'
import { isCleanExample, isSentenceTranslation } from '@/lib/dictionary/textQuality'
import { knownWordExamples, senseSections, SHOWN_SENSES, type SenseSection } from '@/lib/dictionary/wordPage'
import type { DictExample } from '@/lib/dictionary/types'
import type { ResolvedText } from '@/lib/dictionary/tappable'
import type { FamilyWord, ViewWord, WordView } from '@/lib/dictionary/wordView'
import type { LangCode } from '@/lib/languages'

interface Row { key: string; left: React.ReactNode; right: React.ReactNode }

/**
 * Two languages side by side: every row pairs the source on the left with the Vietnamese
 * on the right, under a word bar that stays in view and beside a table of contents.
 */
export function BilingualLayout({ view }: { view: WordView }) {
  const { head } = view
  const lang = head.lang
  const sections = senseSections(view.senses)
  const byText = new Map(view.resolved.map((r) => [r.text, r]))
  const synonymsBySense = new Map(view.senseSynonyms.map((s) => [s.senseOrder, s.words]))
  const examples = knownWordExamples(view.examples.filter((e) => isCleanExample(e.text)), view.resolved, lang)
  const source = LANG_LABELS[lang]

  const wordRows = (words: (ViewWord | FamilyWord)[], family = false): Row[] =>
    words.map((w) => ({
      key: w.text,
      left: (
        <span className="flex flex-wrap items-baseline gap-x-2">
          <WordLink word={w} className={`font-semibold hover:underline ${family ? 'text-black' : 'text-blue-700'}`}>
            {family && 'stem' in w ? <MorphText word={w} /> : w.text}
          </WordLink>
          <PosTag value={w.pos} className="text-xs text-black/40" />
        </span>
      ),
      right: (
        <span className="flex items-baseline justify-between gap-2">
          <span className={w.gloss ? 'text-black/80' : 'text-black/30'}>{w.gloss ?? 'Chưa có nghĩa'}</span>
          <LevelChip level={w.level} />
        </span>
      ),
    }))

  const blocks: { id: string; title: string; count: number; node: React.ReactNode }[] = [
    ...sections.map((sec) => ({
      id: sec.anchor,
      title: sec.labelVi,
      count: sec.senses.length,
      node: (
        <MeaningSection
          section={sec} lang={lang} byText={byText} glosses={view.glosses}
          examples={view.examplesBySense} synonymsBySense={synonymsBySense}
        />
      ),
    })),
    ...(view.forms.length > 0 ? [{
      id: 'forms', title: 'Dạng từ', count: view.forms.length,
      node: (
        <Pairs
          head={[source, 'Tên dạng']}
          rows={view.forms.map((f) => ({
            key: f.text,
            left: <Link href={searchPath(lang, f.text)} className="text-lg font-medium hover:underline"><FormText form={f} /></Link>,
            right: <span className="text-black/70">{f.label}{f.irregular && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">bất quy tắc</span>}</span>,
          }))}
        />
      ),
    }] : []),
    ...(view.conjugation ? [{ id: 'conjugation', title: 'Chia động từ', count: 0, node: <ConjugationTable conjugation={view.conjugation} /> }] : []),
    ...(lang === 'zh' && view.characters.length > 0
      ? [{ id: 'characters', title: 'Chữ và bộ thủ', count: view.characters.length, node: <CharacterPanel characters={view.characters} /> }]
      : []),
    ...(view.phrases.length > 0 ? [{
      id: 'phrases', title: 'Cụm từ', count: view.phrases.length,
      node: <Pairs head={[source, 'Tiếng Việt']} rows={wordRows(view.phrases)} shown={8} />,
    }] : []),
    ...(view.family.length + view.related.length > 0 ? [{
      id: 'family', title: 'Họ từ', count: view.family.length + view.related.length,
      node: <Pairs head={[source, 'Tiếng Việt']} rows={[...wordRows(view.family, true), ...wordRows(view.related)]} shown={8} />,
    }] : []),
    ...(view.synonyms.length + view.antonyms.length > 0 ? [{
      id: 'synonyms', title: view.antonyms.length > 0 ? 'Đồng nghĩa và trái nghĩa' : 'Đồng nghĩa', count: view.synonyms.length + view.antonyms.length,
      node: (
        <Pairs
          head={[source, 'Tiếng Việt']}
          rows={[
            ...wordRows(view.synonyms),
            ...view.antonyms.map((w) => ({
              key: `anti-${w.text}`,
              left: <span className="flex items-baseline gap-2"><WordChip word={w} tone="rose" /><span className="text-xs text-rose-700">trái nghĩa</span></span>,
              right: <span className={w.gloss ? 'text-black/80' : 'text-black/30'}>{w.gloss ?? 'Chưa có nghĩa'}</span>,
            })),
          ]}
          shown={8}
        />
      ),
    }] : []),
    ...(examples.length > 0 ? [{
      id: 'examples', title: 'Ví dụ', count: examples.length,
      node: (
        <Pairs
          head={[source, 'Tiếng Việt']}
          rows={examples.map((e, i) => ({ key: `${i}`, ...exampleCells(e, lang, byText, view.glosses) }))}
          shown={4}
        />
      ),
    }] : []),
    ...(view.siblings.length > 0 ? [{
      id: 'other-languages', title: 'Ngôn ngữ khác', count: view.siblings.length,
      node: (
        <Pairs
          head={['Từ', 'Tiếng Việt']}
          rows={view.siblings.map((s) => ({
            key: s.id,
            left: (
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-xs text-black/40">{LANG_LABELS[s.lang]}</span>
                <Link href={entryPath(s.id)} className="font-semibold text-blue-700 hover:underline">{s.headword}</Link>
                {s.reading && <span className="text-sm text-black/45">{s.reading}</span>}
              </span>
            ),
            right: <span className="text-black/80">{s.glossVi || s.glossEn}</span>,
          }))}
        />
      ),
    }] : []),
  ]

  return (
    <div className="flex flex-col gap-6">
      <WordBar view={view} />
      {view.lemma && <LemmaLink lemma={view.lemma} preview={view.lemmaPreview ?? undefined} lang={lang} />}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[180px_minmax(0,1fr)]">
        <nav aria-label="Mục trong trang" className="sticky top-[calc(var(--header-h)+6rem)] hidden flex-col gap-0.5 self-start lg:flex">
          {blocks.map((b) => (
            <a key={b.id} href={`#${b.id}`} className="flex items-baseline justify-between gap-2 rounded-md px-2 py-1 text-sm text-black/70 hover:bg-black/5">
              <span className="truncate">{b.title}</span>
              {b.count > 0 && <span className="text-xs tabular-nums text-black/35">{b.count}</span>}
            </a>
          ))}
        </nav>
        <div className="flex min-w-0 flex-col gap-10">
          {view.summary && <p className="text-xl leading-snug text-black/85">{view.summary}</p>}
          {blocks.map((b) => (
            <section key={b.id} id={b.id} className="flex scroll-mt-20 flex-col gap-3">
              <h2 className="flex items-baseline gap-2 text-lg font-semibold">
                {b.title}
                {b.count > 0 && <span className="text-sm font-normal text-black/45">{b.count}</span>}
              </h2>
              {b.node}
            </section>
          ))}
          <GrammarLinks points={view.grammarPoints} />
          <AiCorner lang={lang} headword={head.headword} meaningVi={view.meaningVi} />
        </div>
      </div>
    </div>
  )
}

/** The headword, its sound, level and first equivalents, kept in view while the rows scroll. */
function WordBar({ view }: { view: WordView }) {
  const { head } = view
  const bars = frequencyBars(head.frequencyRank)
  const firsts = (['zh', 'es', 'en'] as const)
    .filter((l) => l !== head.lang)
    .map((l) => view.siblings.find((s) => s.lang === l))
    .filter((s) => s !== undefined)
  return (
    <div className="z-20 -mx-4 md:sticky md:top-[var(--header-h)] flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-black/10 bg-white/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">{head.headword}</h1>
      {head.traditional && head.traditional !== head.headword && <span className="text-xl text-black/40">{head.traditional}</span>}
      <LevelChip level={head.level} strong />
      {bars > 0 && (
        <span className="text-xs font-semibold text-emerald-700" title="Nằm trong 3000 từ thông dụng nhất của ngôn ngữ này">Hay gặp</span>
      )}
      <Pronunciation headword={head.headword} prons={head.pronunciations} lang={head.lang} />
      {firsts.length > 0 && (
        <span className="flex flex-wrap items-baseline gap-x-3 text-sm">
          {firsts.map((s) => (
            <Link key={s.id} href={entryPath(s.id)} className="hover:underline">
              <span className="text-xs text-black/40">{s.lang.toUpperCase()} </span>
              <span className="font-medium">{s.headword}</span>
              {s.reading && <span className="text-black/45"> {s.reading}</span>}
            </Link>
          ))}
        </span>
      )}
      <div className="ml-auto">
        <AddToWordlistButton entry={{ ...head, pronunciations: [] }} />
      </div>
    </div>
  )
}

/** Rows of two cells, the header naming each column, the first `shown` rows then a button. */
function Pairs({ head, rows, shown = 0 }: { head: [string, string]; rows: Row[]; shown?: number }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded || shown === 0 ? rows : rows.slice(0, shown)
  return (
    <div className="flex flex-col">
      <div aria-hidden="true" className="hidden grid-cols-2 gap-8 pb-1 text-xs font-semibold uppercase tracking-wide text-black/40 md:grid">
        <span>{head[0]}</span>
        <span>{head[1]}</span>
      </div>
      <ul className="flex flex-col">
        {visible.map((r) => (
          <li key={r.key} className="grid grid-cols-1 gap-x-8 gap-y-0.5 border-t border-black/10 py-2.5 md:grid-cols-2">
            <div className="min-w-0">{r.left}</div>
            <div className="min-w-0">{r.right}</div>
          </li>
        ))}
      </ul>
      {shown > 0 && rows.length > shown && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-1 w-fit text-sm font-medium text-blue-700 hover:underline"
        >
          {expanded ? 'Thu gọn' : `Xem thêm ${rows.length - shown}`}
        </button>
      )}
    </div>
  )
}

function exampleCells(e: DictExample, lang: LangCode, byText: Map<string, ResolvedText>, glosses: (string | null)[]) {
  return {
    left: (
      <span className="flex items-start gap-1.5 text-black/85">
        <span><TappableText text={e.text} lang={lang} resolved={byText.get(e.text)} /></span>
        <AudioButton text={e.text} lang={lang} />
      </span>
    ),
    right: isSentenceTranslation(e.translationVi, glosses) ? <span className="text-black/60">{e.translationVi}</span> : null,
  }
}

/** One part of speech: the English definition beside the Vietnamese meaning, the synonyms
 *  of that meaning under the English, and the sense's example as a row of its own. */
function MeaningSection({ section, lang, byText, glosses, examples, synonymsBySense }: {
  section: SenseSection
  lang: LangCode
  byText: Map<string, ResolvedText>
  glosses: (string | null)[]
  examples: Record<string, DictExample>
  synonymsBySense: Map<number, ViewWord[]>
}) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? section.senses : section.senses.slice(0, SHOWN_SENSES)
  const hidden = section.senses.length - SHOWN_SENSES
  return (
    <div className="flex flex-col">
      <div aria-hidden="true" className="hidden grid-cols-2 gap-8 pb-1 text-xs font-semibold uppercase tracking-wide text-black/40 md:grid">
        <span>{LANG_LABELS.en}</span>
        <span>Tiếng Việt</span>
      </div>
      <ol className="flex flex-col">
        {visible.map((s, i) => {
          const example = s.id ? examples[s.id] : undefined
          const synonyms = synonymsBySense.get(s.senseOrder) ?? []
          const cells = example ? exampleCells(example, lang, byText, glosses) : null
          return (
            <li key={s.id ?? `${s.senseOrder}-${i}`} className="grid grid-cols-1 gap-x-8 gap-y-1.5 border-t border-black/10 py-3 md:grid-cols-2">
              <div className="flex min-w-0 gap-2">
                <span className="w-5 shrink-0 text-right text-black/40">{i + 1}.</span>
                <div className="flex min-w-0 flex-col gap-1.5">
                  {s.glossEn && <span className="text-black/80">{s.glossEn}</span>}
                  {synonyms.length > 0 && (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-black/40" title="Đồng nghĩa">≈</span>
                      {synonyms.map((w) => <WordChip key={w.text} word={w} />)}
                    </span>
                  )}
                </div>
              </div>
              <div className="min-w-0 pl-7 md:pl-0">
                {s.glossVi
                  ? <span className="font-medium text-black/90">{s.glossVi}</span>
                  : s.pivotVi
                    ? (
                      <span className="font-medium text-black/90">
                        {s.pivotVi}
                        <span className="ml-1 align-middle text-[10px] font-normal uppercase tracking-wide text-amber-700/70" title="Nghĩa suy ra qua tiếng Anh">qua tiếng Anh</span>
                      </span>
                    )
                    : <span className="text-black/30">Chưa có nghĩa tiếng Việt</span>}
              </div>
              {cells && (
                <>
                  <div className="ml-7 min-w-0 border-l-2 border-blue-600/60 pl-3">{cells.left}</div>
                  <div className="min-w-0 pl-7 text-sm md:pl-0">{cells.right}</div>
                </>
              )}
            </li>
          )
        })}
      </ol>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-1 w-fit text-sm font-medium text-blue-700 hover:underline"
        >
          {expanded ? 'Thu gọn' : `+ ${hidden} nghĩa ${section.key ? `${section.labelVi.toLocaleLowerCase('vi')} ` : ''}khác`}
        </button>
      )}
    </div>
  )
}
