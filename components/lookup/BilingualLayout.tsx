import { useState } from 'react'
import Link from 'next/link'
import { Pronunciation } from './Pronunciation'
import { AddToWordlistButton } from './AddToWordlistButton'
import { CharacterPanel } from './CharacterPanel'
import { ConjugationTable } from './ConjugationTable'
import { LemmaLink } from './LemmaLink'
import { BACKLINKS_LABEL, BacklinkList, LayerNote } from './LearnerParts'
import {
  AiCorner, Badge, CONTAINER, EnglishMark, FormCells, FrequencyMeter, GrammarList, LevelChip, MorphText, MoreButton, PivotMark, PosChip, ToeicChip, WordChip,
  UntranslatedNote, WordLink, baseFormLabel,
} from './WordParts'
import { AudioButton } from '@/components/ui/AudioButton'
import { useAnchor } from '@/lib/hooks/useAnchor'
import { TappableText } from '@/components/reader/TappableText'
import { entryPath } from '@/lib/dictionary/entryId'
import { LANG_LABELS } from '@/lib/dictionary/labels'
import { isSentenceTranslation } from '@/lib/dictionary/textQuality'
import { senseSections, SHOWN_SENSES, type SenseSection } from '@/lib/dictionary/wordPage'
import { cleanExamples, headwordForms, senseLabel, type FamilyWord, type ViewWord, type WordView } from '@/lib/dictionary/wordView'
import type { DictExample } from '@/lib/dictionary/types'
import type { ResolvedText } from '@/lib/dictionary/tappable'
import type { LangCode } from '@/lib/languages'

interface Row { key: string; left: React.ReactNode; right: React.ReactNode }

const ROW_GRID = 'grid grid-cols-1 border-t border-(--zs-line) md:grid-cols-2 md:gap-x-10'
const ROW = `${ROW_GRID} gap-y-1.5 py-3.5`
const RIGHT = 'min-w-0 md:border-l md:border-(--zs-line) md:pl-5'

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
  const examples = cleanExamples(view.examples, view.resolved, lang)
  const mark = headwordForms(view)
  const irregular = view.forms.some((f) => f.irregular)
  const anchor = useAnchor()

  const wordRows = (words: (ViewWord | FamilyWord)[], family = false, tag?: string): Row[] =>
    words.map((w) => ({
      key: w.text,
      left: (
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <WordLink word={w} className={`text-base font-semibold hover:underline ${family ? '' : 'text-(--zs-pen)'}`}>
            {family && 'stem' in w ? <MorphText word={w} /> : w.text}
          </WordLink>
          <PosChip value={w.pos} />
          <LevelChip level={w.level} />
          {tag && <span className="text-xs text-(--zs-soft)">{tag}</span>}
        </span>
      ),
      right: <span className={`text-[15px] ${w.gloss ? '' : 'text-(--zs-soft)'}`}>{w.gloss ?? 'Chưa có nghĩa'}{w.glossIsEnglish && <EnglishMark />}</span>,
    }))

  const blocks: { id: string; title: string; note?: React.ReactNode; count: number; node: React.ReactNode }[] = [
    ...sections.map((sec) => ({
      id: sec.anchor,
      title: sec.labelVi,
      count: sec.senses.length,
      note: <span className="text-[13px] text-(--zs-soft)">{sec.senses.length} nghĩa</span>,
      node: (
        <MeaningSection
          section={sec} lang={lang} byText={byText} glosses={view.glosses} mark={mark}
          examples={view.examplesBySense} synonymsBySense={synonymsBySense}
        />
      ),
    })),
    // After the meanings, so a phone opens on the first one.
    ...(view.forms.length > 0 ? [{
      id: 'forms', title: 'Dạng từ', count: 0,
      note: irregular && <Badge tone="strong">Bất quy tắc</Badge>,
      node: <FormCells headword={head.headword} baseLabel={baseFormLabel(view.forms)} forms={view.forms} lang={lang} variant="wide" />,
    }] : []),
    ...(view.conjugation ? [{ id: 'conjugation', title: 'Chia động từ', count: 0, node: <ConjugationTable conjugation={view.conjugation} /> }] : []),
    ...(lang === 'zh' && view.characters.length > 0
      ? [{ id: 'characters', title: 'Chữ và bộ thủ', count: 0, node: <CharacterPanel characters={view.characters} /> }]
      : []),
    ...(view.phrases.length > 0 ? [{
      id: 'phrases', title: 'Cụm từ', count: view.phrases.length,
      note: <span className="text-[13px] text-(--zs-soft)">{view.phrases.length} cụm</span>,
      node: <RowList rows={wordRows(view.phrases)} shown={6} more={(n) => `Xem thêm ${n} cụm từ`} />,
    }] : []),
    ...(view.family.length + view.related.length > 0 ? [{
      id: 'family', title: 'Họ từ', count: view.family.length + view.related.length,
      note: view.family.length > 0 && <span className="text-[13px] text-(--zs-soft)">cùng gốc {view.lemma ?? head.headword}</span>,
      node: <RowList rows={[...wordRows(view.family, true), ...wordRows(view.related, false, 'liên quan')]} shown={6} more={(n) => `Xem thêm ${n} từ`} />,
    }] : []),
    ...(view.synonyms.length + view.antonyms.length > 0 ? [{
      id: 'synonyms', title: view.antonyms.length > 0 ? 'Đồng nghĩa và trái nghĩa' : 'Đồng nghĩa', count: view.synonyms.length + view.antonyms.length,
      node: (
        <RowList
          rows={[
            ...wordRows(view.synonyms),
            ...view.antonyms.map((w) => ({
              key: `anti-${w.text}`,
              left: <span className="flex items-center gap-2"><WordChip word={w} tone="rose" /><span className="text-xs text-(--zs-soft)">trái nghĩa</span></span>,
              right: <span className={`text-[15px] ${w.gloss ? '' : 'text-(--zs-soft)'}`}>{w.gloss ?? 'Chưa có nghĩa'}{w.glossIsEnglish && <EnglishMark />}</span>,
            })),
          ]}
          shown={6}
          more={(n) => `Xem thêm ${n} từ`}
        />
      ),
    }] : []),
    ...(examples.length > 0 ? [{
      id: 'examples', title: 'Ví dụ', count: examples.length,
      node: (
        <RowList
          rows={examples.map((e, i) => ({ key: `${i}`, ...exampleCells(e, lang, byText, view.glosses, mark) }))}
          shown={4}
          more={(n) => `Xem thêm ${n} ví dụ`}
        />
      ),
    }] : []),
    ...(view.grammarPoints.length > 0 ? [{
      id: 'grammar', title: 'Ngữ pháp', count: 0, node: <GrammarList points={view.grammarPoints} />,
    }] : []),
    ...(view.backlinks.length > 0 ? [{
      id: 'backlinks', title: BACKLINKS_LABEL, count: view.backlinks.length, node: <BacklinkList view={view} />,
    }] : []),
    ...(view.siblings.length > 0 ? [{
      id: 'other-languages', title: 'Ngôn ngữ khác', count: view.siblings.length,
      node: (
        <RowList
          rows={view.siblings.map((s) => ({
            key: s.id,
            left: (
              <span className="flex flex-wrap items-baseline gap-x-2.5">
                <span className="text-xs text-(--zs-soft)">{LANG_LABELS[s.lang]}</span>
                <Link href={entryPath(s.id)} data-hw="" lang={s.lang} className="text-lg text-(--zs-pen) hover:underline">{s.headword}</Link>
                {s.reading && <span className="text-sm text-(--zs-soft)">{s.reading}</span>}
              </span>
            ),
            right: <span className="text-[15px]">{s.glossVi || s.glossEn}{!s.glossVi && s.glossEn && <EnglishMark />}</span>,
          }))}
        />
      ),
    }] : []),
  ]

  return (
    <div className="flex flex-col gap-8">
      <WordBar view={view} />
      <div className={`${CONTAINER} grid grid-cols-1 gap-10 lg:grid-cols-[200px_minmax(0,1fr)]`}>
        <nav aria-label="Mục trong trang" className="sticky top-[calc(var(--header-h)+6.5rem)] hidden max-h-[calc(100dvh-var(--header-h)-8rem)] flex-col gap-3 self-start overflow-y-auto lg:flex">
          <span className="text-xs font-bold tracking-[0.02em] text-(--zs-soft)">Trên trang này</span>
          <ul className="flex flex-col gap-2.5 text-sm">
            {blocks.map((b) => {
              const sec = sections.find((s) => s.anchor === b.id)
              return (
                <li key={b.id} className="flex flex-col gap-1.5">
                  <a href={`#${anchor(b.id)}`} className="font-medium hover:underline">
                    {b.title}
                    {b.count > 0 && <span className="ml-1 font-normal text-(--zs-soft)">{b.count}</span>}
                  </a>
                  {sec && (
                    <ul className="flex flex-col gap-1 border-l border-(--zs-line) pl-3 text-(--zs-soft)">
                      {sec.senses.slice(0, SHOWN_SENSES).map((s, i) => (
                        <li key={s.id ?? i}><a href={`#${anchor(`${sec.anchor}-${i + 1}`)}`} className="block truncate hover:text-(--zs-ink)">{senseLabel(s)}</a></li>
                      ))}
                      {sec.senses.length > SHOWN_SENSES && (
                        <li className="text-(--zs-soft)">+ {sec.senses.length - SHOWN_SENSES} nghĩa</li>
                      )}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="flex min-w-0 flex-col gap-12">
          {view.lemma && <LemmaLink lemma={view.lemma} preview={view.lemmaPreview ?? undefined} lang={lang} />}
          <UntranslatedNote senses={view.senses} />
          {view.learner && <div className="-mt-9"><LayerNote layer={view.learner} view={view} /></div>}
          <div className="flex flex-col gap-10">
            <div aria-hidden="true" className="hidden grid-cols-2 gap-x-10 border-b-2 border-(--c-l) pb-2 text-xs font-bold tracking-[0.02em] text-(--zs-soft) md:grid">
              <span>{lang === 'en' ? LANG_LABELS.en : `${LANG_LABELS[lang]}, tiếng Anh`}</span>
              <span className="pl-5">Tiếng Việt</span>
            </div>
            {blocks.map((b) => (
              <section key={b.id} id={anchor(b.id)} data-reveal="" className="flex flex-col gap-4 md:scroll-mt-24">
                <h2 className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[22px] font-extrabold tracking-[-0.02em]">
                  {b.title}
                  {b.note}
                </h2>
                {b.node}
              </section>
            ))}
          </div>
          <AiCorner lang={lang} headword={head.headword} meaningVi={view.meaningVi} entryId={head.id} />
        </div>
      </div>
    </div>
  )
}

/** The headword, its sound and level, kept in view while the rows scroll. The other languages
 *  have a block of their own. */
function WordBar({ view }: { view: WordView }) {
  const { head } = view
  return (
    <div className="z-20 border-b-2 border-(--c-l) bg-(--zs-bg)/88 backdrop-blur-[10px] md:sticky md:top-[var(--header-h)]">
      <div className={`${CONTAINER} flex flex-wrap items-center gap-x-4 gap-y-2.5 py-3.5`}>
        <h1 data-hw="" lang={head.lang} className="text-4xl leading-none sm:text-[44px]">{head.headword}</h1>
        {head.traditional && head.traditional !== head.headword && <span data-hw="" lang="zh" className="text-2xl text-(--zs-soft)">{head.traditional}</span>}
        <Pronunciation headword={head.headword} prons={head.pronunciations} lang={head.lang} pill />
        <LevelChip level={head.level} strong />
        <ToeicChip place={view.toeic} />
        <FrequencyMeter rank={head.frequencyRank} small />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 lg:ml-auto">
          <AddToWordlistButton size="lg" entry={{ ...head, pronunciations: [] }} />
        </div>
      </div>
    </div>
  )
}

/** Rows of two cells, the first `shown` rows then a button. */
function RowList({ rows, shown = 0, more }: { rows: Row[]; shown?: number; more?: (hidden: number) => string }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded || shown === 0 ? rows : rows.slice(0, shown)
  return (
    <div className="flex flex-col">
      <ul className="flex flex-col border-b border-(--zs-line)">
        {visible.map((r, i) => (
          <li key={r.key} data-more={(shown > 0 && i >= shown) || undefined} className={ROW}>
            <div className="min-w-0">{r.left}</div>
            <div className={RIGHT}>{r.right}</div>
          </li>
        ))}
      </ul>
      {more && shown > 0 && rows.length > shown && (
        <MoreButton expanded={expanded} label={more(rows.length - shown)} onClick={() => setExpanded((v) => !v)} className="mt-3" />
      )}
    </div>
  )
}

function exampleCells(e: DictExample, lang: LangCode, byText: Map<string, ResolvedText>, glosses: (string | null)[], mark: string[]) {
  return {
    left: (
      <span className="flex items-start gap-1.5">
        <span data-ex="" lang={lang}><TappableText text={e.text} lang={lang} resolved={byText.get(e.text)} quiet mark={mark} translation={isSentenceTranslation(e.translationVi, glosses) ? e.translationVi : null} /></span>
        <AudioButton text={e.text} lang={lang} />
      </span>
    ),
    right: isSentenceTranslation(e.translationVi, glosses) ? <span data-ex-vi="plain">{e.translationVi}</span> : null,
  }
}

/** One part of speech: the English definition beside the Vietnamese meaning, the synonyms
 *  of that meaning under the English, and the sense's example as a row of its own. */
function MeaningSection({ section, lang, byText, glosses, mark, examples, synonymsBySense }: {
  section: SenseSection
  lang: LangCode
  byText: Map<string, ResolvedText>
  glosses: (string | null)[]
  mark: string[]
  examples: Record<string, DictExample>
  synonymsBySense: Map<number, ViewWord[]>
}) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? section.senses : section.senses.slice(0, SHOWN_SENSES)
  const hidden = section.senses.length - SHOWN_SENSES
  const anchor = useAnchor()
  return (
    <div className="flex flex-col">
      <ol className="flex flex-col border-b border-(--zs-line)">
        {visible.map((s, i) => {
          const example = s.id ? examples[s.id] : undefined
          const synonyms = synonymsBySense.get(s.senseOrder) ?? []
          const cells = example ? exampleCells(example, lang, byText, glosses, mark) : null
          return (
            <li key={s.id ?? `${s.senseOrder}-${i}`} id={anchor(`${section.anchor}-${i + 1}`)} data-more={i >= SHOWN_SENSES || undefined} className={`${ROW_GRID} gap-y-2.5 py-4 md:scroll-mt-24`}>
              <div className="flex min-w-0 gap-3">
                <span className="w-4 shrink-0 pt-0.5 text-sm tabular-nums text-(--zs-soft)">{i + 1}</span>
                <div className="flex min-w-0 flex-col gap-2.5">
                  {s.glossEn && <span className="text-base leading-normal">{s.glossEn}</span>}
                  {synonyms.length > 0 && (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-(--zs-soft)" title="Đồng nghĩa">≈</span>
                      {synonyms.map((w) => <WordChip key={w.text} word={w} />)}
                    </span>
                  )}
                </div>
              </div>
              <div className={`${RIGHT} pl-7`}>
                {s.glossVi || s.pivotVi
                  ? <span className="text-lg font-semibold leading-snug md:text-xl">{s.glossVi ?? s.pivotVi}{!s.glossVi && <PivotMark />}</span>
                  : <span className="text-(--zs-soft)">Chưa có nghĩa tiếng Việt</span>}
              </div>
              {cells && (
                <>
                  <div className="ml-7 min-w-0 border-l-2 border-(--c-l) pl-3.5">{cells.left}</div>
                  <div className={`${RIGHT} pl-7`}>{cells.right}</div>
                </>
              )}
            </li>
          )
        })}
      </ol>
      {hidden > 0 && (
        <MoreButton
          expanded={expanded}
          label={`Xem thêm ${hidden} nghĩa ${section.key ? `${section.labelVi.toLocaleLowerCase('vi')}` : 'khác'}`}
          onClick={() => setExpanded((v) => !v)}
          className="mt-3"
        />
      )}
    </div>
  )
}
