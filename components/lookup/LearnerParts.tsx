import { useState } from 'react'
import { AddToWordlistButton } from './AddToWordlistButton'
import { CrossLanguagePanel } from './CrossLanguagePanel'
import { saveableEntry } from './LookupHero'
import { Pronunciation } from './Pronunciation'
import { GrammarChips, OriginNotes, SoundNotes, soundFacts } from './WordNotes'
import {
  CARD, CONTAINER, FamilyRows, FrequencyMeter, LevelChip, MoreButton, PivotMark, PosChip, SectionLabel, SynonymsRows, ToeicChip, WordLink,
  WordTable, hasSynonyms,
} from './WordParts'
import { AudioButton } from '@/components/ui/AudioButton'
import { TappableText } from '@/components/reader/TappableText'
import { entryPath } from '@/lib/dictionary/entryId'
import { genderLabel } from '@/lib/dictionary/gender'
import { LANG_LABELS } from '@/lib/dictionary/labels'
import {
  LINK_KIND_VI, domainLabel, formDescriptionVi, markHeadword, markedRanges, registerLabel, sourceNumbers,
  type LearnerExample, type LearnerLayer, type LearnerLink, type LearnerSense, type MinorSense,
} from '@/lib/dictionary/learner'
import { grammarLabels, shownOrigins } from '@/lib/dictionary/origin'
import { posGroups } from '@/lib/dictionary/pos'
import { isClassifierGloss } from '@/lib/dictionary/textQuality'
import { headwordForms, type WordView } from '@/lib/dictionary/wordView'
import type { LangCode } from '@/lib/languages'

/** Pieces the three learner-layer layouts share, after the prototype the owner approved. */

export const PANEL = `${CARD} flex flex-col gap-2.5 p-4 sm:p-5`

/** One tone per core sense, for the layout that links everything by colour: the value of
 *  `data-tone`, whose colour `--t` and ink `--t-ink` Word.module.css sets. */
const SENSE_TONES = 5

export const toneOf = (order: number) => ((order - 1) % SENSE_TONES) + 1

const CHIP = {
  neutral: 'bg-(--zs-chip) text-(--zs-soft)',
  domain: 'bg-(--tint-3) text-(--zs-ink)',
  register: 'text-(--zs-ink) ring-1 ring-inset ring-sea-300',
  form: 'bg-(--tint-2) text-(--zs-ink) ring-1 ring-inset ring-(--edge)',
} as const

export function Chip({ tone = 'neutral', children }: { tone?: keyof typeof CHIP; children: React.ReactNode }) {
  return <span className={`shrink-0 rounded-full px-[7px] py-0.5 text-[11px] ${CHIP[tone]}`}>{children}</span>
}

/** Part of speech, level, subject field, register and grammar, whichever the sense has. */
export function SenseChips({ pos, cefr, domain, register, grammar = [], children }: {
  pos?: string | null
  cefr?: string | null
  domain: string | null
  register: string | null
  grammar?: string[]
  children?: React.ReactNode
}) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {children}
      <PosChip value={pos} />
      <LevelChip level={cefr ?? null} />
      {domain && <Chip tone="domain">{domainLabel(domain)}</Chip>}
      {register && <Chip tone="register">{registerLabel(register)}</Chip>}
      <GrammarChips labels={grammar} />
    </span>
  )
}

/** A word the layer mentions: a link when the dictionary holds it, plain text otherwise. */
export function Mention({ link, className = '' }: { link: Pick<LearnerLink, 'text' | 'targetEntryId'>; className?: string }) {
  if (!link.targetEntryId) return <span className={`font-semibold ${className}`}>{link.text}</span>
  return (
    <WordLink
      word={{ text: link.text, href: entryPath(link.targetEntryId) }}
      className={`mention font-semibold text-(--zs-pen) hover:underline ${className}`}
    />
  )
}

/** A sentence with the headword and its forms in bold, every known word opening the word
 *  popover when the page resolved the sentence, as it does for every sentence of the layer. */
export function Sentence({ text, view, translation = null }: { text: string; view: WordView; translation?: string | null }) {
  const parts = markHeadword(text, view.head.headword, view.head.lang, headwordForms(view))
  const resolved = view.resolved.find((r) => r.text === text)
  if (resolved) {
    return <TappableText text={text} lang={view.head.lang} resolved={resolved} quiet marks={markedRanges(parts)} translation={translation} />
  }
  return <>{parts.map((p, i) => (p.mark ? <b key={i} className="font-bold text-(--zs-pen)">{p.text}</b> : p.text))}</>
}

export function ExampleCard({ example, view }: { example: LearnerExample; view: WordView }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 rounded-r-xl border-l-2 border-(--c-l) bg-(--tint-2) py-3 pr-3 pl-3.5">
      <span data-ex="" lang={view.head.lang}><Sentence text={example.text} view={view} translation={example.vi} /></span>
      <span className="-my-1"><AudioButton text={example.text} lang={view.head.lang} /></span>
      {example.reading && <span className="col-start-1 text-[13px] text-(--zs-soft)">{example.reading}</span>}
      <span data-ex-vi="" className="col-start-1">{example.vi}</span>
      {example.byModel && (
        <span className="col-start-1 text-[10.5px] font-medium uppercase tracking-wide text-(--zs-soft)">câu soạn mới</span>
      )}
    </li>
  )
}

export function Examples({ examples, view }: { examples: LearnerExample[]; view: WordView }) {
  if (examples.length === 0) return null
  return <ul className="flex flex-col gap-2">{examples.map((x, i) => <ExampleCard key={i} example={x} view={view} />)}</ul>
}

/** A collocation's meaning, then its example with the example's own pinyin and translation. */
export function CollocationGloss({ link, view }: { link: LearnerLink; view: WordView }) {
  return (
    <>
      {link.vi && <span className="block text-[13.5px] font-semibold text-(--zs-ink) sm:text-sm">{link.vi}</span>}
      {link.example && <span data-ex="sm" lang={view.head.lang} className="mt-1 block"><Sentence text={link.example} view={view} translation={link.exampleVi} /></span>}
      {link.exampleReading && <span className="block text-xs text-(--zs-soft)">{link.exampleReading}</span>}
      {link.exampleVi && <span data-ex-vi="plain">{link.exampleVi}</span>}
    </>
  )
}

/** Fixed columns, so the tables of every sense on a page line up. */
function CollocationTable({ links, view }: { links: LearnerLink[]; view: WordView }) {
  return (
    <table className="w-full border-collapse text-sm sm:table-fixed">
      <colgroup>
        <col className="sm:w-[34%]" />
        <col className="sm:w-28" />
        <col />
      </colgroup>
      <tbody>
        {links.map((k) => (
          <tr key={k.text} className="border-t border-(--zs-line) align-top first:border-0">
            <td className="break-words py-2.5 pr-3">
              <Mention link={k} />
              {k.reading && <span className="block text-xs text-(--zs-soft)">{k.reading}</span>}
              {k.pattern && <span className="block font-mono text-[11px] text-(--zs-soft) sm:hidden">{k.pattern}</span>}
            </td>
            <td className="hidden break-words py-2.5 pr-3 pt-3 font-mono text-[11px] text-(--zs-soft) sm:table-cell">{k.pattern}</td>
            <td className="py-2.5">
              <CollocationGloss link={k} view={view} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Words with a note on how each differs. `columns` sets the words in one fixed column so
 *  the notes start on one line; a narrow card stacks them, as a phone does. */
export function NoteList({ links, columns = false }: { links: LearnerLink[]; columns?: boolean }) {
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {links.map((x, i) => (
        <li
          key={`${x.text}-${i}`}
          className={`grid gap-x-3 gap-y-0.5 ${columns ? 'sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-baseline' : ''}`}
        >
          <Mention link={x} className="break-words" />
          <span className="text-[13.5px] text-(--zs-soft)">{x.noteVi}</span>
        </li>
      ))}
    </ul>
  )
}

/** The sense's words in the other two languages, Chinese first as the cross-language card
 *  orders them. */
export function Equivalents({ links }: { links: LearnerLink[] }) {
  const byLang = (['zh', 'es', 'en'] as const).map((lang) => ({ lang, words: links.filter((l) => l.lang === lang) }))
    .filter((g) => g.words.length > 0)
  return (
    <span className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
      {byLang.map((g) => (
        <span key={g.lang}>
          <span className="mr-1.5 text-[11px] text-(--zs-soft)">{LANG_LABELS[g.lang]}</span>
          {g.words.map((w, i) => <span key={w.text}>{i > 0 && ', '}<Mention link={w} /></span>)}
        </span>
      ))}
    </span>
  )
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <SectionLabel as="h3">{label}</SectionLabel>
      {children}
    </div>
  )
}

const TERMS = { lg: 'text-[28px] sm:text-[30px]', md: 'text-[21px]' } as const

/** A core sense in full: its Vietnamese terms, the plain Vietnamese definition, the English
 *  one, examples, collocations, related words, the other languages and where it came from. */
export function SenseBody({ sense, view, size = 'md' }: { sense: LearnerSense; view: WordView; size?: keyof typeof TERMS }) {
  const own = sense.equivalents.filter((e) => e.lang !== view.head.lang)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <SenseChips
          pos={sense.pos} cefr={sense.cefr} domain={sense.domain} register={sense.register}
          grammar={grammarLabels(view.notes, sense.sourceSenseIds)}
        />
        <h2 className={`font-extrabold leading-tight tracking-[-0.02em] ${TERMS[size]}`}>
          {sense.viTerms.join(', ')}{sense.pivot && <PivotMark />}
        </h2>
        {sense.viDefinition && <p className="text-[15.5px] leading-relaxed">{sense.viDefinition}</p>}
        {sense.enDefinition && <p className="text-[13.5px] text-(--zs-soft)">{sense.enDefinition}</p>}
      </div>
      <Examples examples={sense.examples} view={view} />
      {sense.collocations.length > 0 && <Block label="Kết hợp hay gặp"><CollocationTable links={sense.collocations} view={view} /></Block>}
      {sense.synonyms.length > 0 && <Block label="Đồng nghĩa"><NoteList links={sense.synonyms} columns /></Block>}
      {sense.antonyms.length > 0 && <Block label="Trái nghĩa"><NoteList links={sense.antonyms} columns /></Block>}
      {own.length > 0 && <Block label="Ở ngôn ngữ khác"><Equivalents links={own} /></Block>}
      <SourceLine ids={sense.sourceSenseIds} view={view} />
    </div>
  )
}

/** A sense without English is one a model wrote: on 2026-09-29 all 62,279 of them were
 *  `zhesen-ai`, and no Wiktionary or CC-CEDICT sense lacked English. */
const fromDictionary = (s: { glossEn: string | null }) => s.glossEn !== null

export function SourceLine({ ids, view }: { ids: string[]; view: WordView }) {
  const numbers = sourceNumbers(ids, view.senses.filter(fromDictionary))
  if (!numbers) return null
  return <p className="text-[11px] text-(--zs-soft)">Từ nghĩa {numbers} của {sourceName(view.head.lang)}</p>
}

/** The dictionary the raw senses of a language come from. */
const sourceName = (lang: LangCode) => (lang === 'zh' ? 'CC-CEDICT' : 'Wiktionary')

/** The title every layout gives the senses that are forms of another word. */
export const FORMS_LABEL = 'Là dạng của từ khác'

/** Wiktionary's English for a minor sense, in Vietnamese when it describes a word form. */
export const minorGloss = (m: MinorSense) => (m.glossEn && m.isInflection ? formDescriptionVi(m.glossEn) : m.glossEn)

/** The terms of a minor sense, or its English when the layer gave none. */
export const minorTerms = (m: MinorSense) => m.viTerms.join(', ') || minorGloss(m) || ''

export function LemmaMention({ minor }: { minor: MinorSense }) {
  if (!minor.lemma) return null
  return <Mention link={{ text: minor.lemma, targetEntryId: minor.lemmaEntryId }} />
}

/** A sense no core sense covers: its labels, its terms and the raw English. */
export function MinorBody({ minor, view }: { minor: MinorSense; view: WordView }) {
  return (
    <div className="flex flex-col gap-2">
      <SenseChips pos={minor.pos} domain={minor.domain} register={minor.register} grammar={grammarLabels(view.notes, [minor.senseId])}>
        {minor.isInflection && <Chip tone="form">dạng từ</Chip>}
      </SenseChips>
      <h2 className="text-[28px] font-extrabold leading-tight tracking-[-0.02em] sm:text-[30px]">{minorTerms(minor)}</h2>
      {minor.isInflection && minor.lemma && (
        <p className="text-[15.5px]">Là một dạng của <LemmaMention minor={minor} />.</p>
      )}
      {minor.glossEn && <p className="text-[13.5px] text-(--zs-soft)">{minorGloss(minor)}</p>}
      <SourceLine ids={[minor.senseId]} view={view} />
    </div>
  )
}

/** Whether the gist holds a term no sense lists. 4,355 of 5,198 AI gists on 2026-10-04 did
 *  not, and a derived gist is the senses' first terms, so the senses below say it again. */
const gistAddsTerm = (layer: Pick<LearnerLayer, 'gistVi' | 'senses'>) => {
  const terms = new Set(layer.senses.flatMap((s) => s.viTerms.map((t) => t.trim().toLocaleLowerCase('vi'))))
  return layer.gistVi.some((g) => g.split(',').some((t) => !terms.has(t.trim().toLocaleLowerCase('vi'))))
}

/** The headword block every learner layout opens with, as compact as the prototype's: the
 *  word with its level and parts of speech, its sound, the layer's short equivalents in
 *  bold unless the senses repeat them, and the save button. */
export function LearnerHeader({ view, layer }: { view: WordView; layer: LearnerLayer }) {
  const head = view.head
  const posLabels = posGroups(layer.senses.map((s) => s.pos)).map((g) => g.labelVi)
  const gender = genderLabel(head.attributes)
  const pinyin = typeof head.attributes.pinyin === 'string' ? head.attributes.pinyin : null
  // As in LookupHero: the pronunciation row carries the pinyin when there is one.
  const showPinyin = pinyin !== null && !head.pronunciations.some((p) => p.ipa?.trim())
  return (
    <div className={CONTAINER}>
      <header className="grid grid-cols-1 gap-x-6 gap-y-2.5 border-b-2 border-(--c-l) pb-5 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3.5 gap-y-2">
          <h1 data-hw="" lang={head.lang} className={`min-w-0 break-words leading-[0.95] ${
            [...head.headword].length > 12 ? 'text-[34px] sm:text-[44px]' : 'text-[44px] sm:text-[60px]'
          }`}>
            {head.headword}
          </h1>
          {head.traditional && head.traditional !== head.headword && (
            <span data-hw="" lang="zh" className="text-[28px] text-(--zs-soft) sm:text-[34px]">{head.traditional}</span>
          )}
          <span className="flex flex-wrap items-center gap-1.5">
            <LevelChip level={head.level ?? layer.level} strong />
            <ToeicChip place={view.toeic} />
            {gender && <Chip>{gender}</Chip>}
            {posLabels.map((p) => <Chip key={p}>{p.toLocaleLowerCase('vi')}</Chip>)}
            <FrequencyMeter rank={head.frequencyRank} small />
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          {showPinyin && <span className="font-medium text-(--zs-soft)">{pinyin}</span>}
          {view.hanViet && <span className="italic text-(--zs-soft)">Hán-Việt: {view.hanViet}</span>}
          <Pronunciation headword={head.headword} prons={head.pronunciations} lang={head.lang} />
        </div>
        {gistAddsTerm(layer) && (
          <p className="text-[21px] font-semibold leading-snug tracking-[-0.01em] text-balance sm:text-2xl">
            {layer.gistVi.map((g, i) => (
              <span key={g}>{i > 0 && <span aria-hidden="true" className="font-normal text-(--zs-pen)">{'\u00a0– '}</span>}{g}</span>
            ))}
          </p>
        )}
        <div className="flex flex-col items-start gap-2 pt-1 sm:col-start-2 sm:row-span-3 sm:row-start-1 sm:items-end sm:pt-0">
          <AddToWordlistButton size="lg" entry={saveableEntry(head)} />
        </div>
      </header>
    </div>
  )
}

/** The usage note, the words learners confuse this one with, and the layers that mention it.
 *  A derived layer holds no related words, so the rail draws the entry's own: its phrases
 *  unless the layout lists them itself, its other synonyms and antonyms, the other languages. */
export function LearnerRail({ view, layer, phrases = true }: { view: WordView; layer: LearnerLayer; phrases?: boolean }) {
  const derived = layer.source === 'dictionary'
  // A main sense lists its own synonyms; the rail keeps those of every other sense.
  const mainIds = new Set(layer.senses.flatMap((s) => s.sourceSenseIds))
  const mainOrders = new Set(view.senses.filter((s) => s.id && mainIds.has(s.id)).map((s) => s.senseOrder))
  const others = {
    senseSynonyms: view.senseSynonyms.filter((g) => !mainOrders.has(g.senseOrder)), synonyms: view.synonyms, antonyms: view.antonyms,
  }
  const sound = soundFacts(view.head, view.notes)
  const leadPos = view.senses[0]?.pos
  const hasOrigin = shownOrigins(view.notes, leadPos).length > 0
  return (
    <>
      {layer.usageNoteVi && (
        <section className={PANEL}>
          <SectionLabel>Mô tả chung</SectionLabel>
          <UsageNote text={layer.usageNoteVi} />
        </section>
      )}
      {layer.confusables.length > 0 && (
        <section className={PANEL}>
          <SectionLabel>Dễ nhầm với</SectionLabel>
          <NoteList links={layer.confusables} />
        </section>
      )}
      {sound !== null && (
        <section className={PANEL}>
          <SectionLabel>Cách đọc</SectionLabel>
          <SoundNotes facts={sound} />
        </section>
      )}
      {derived && phrases && view.phrases.length > 0 && (
        <section className={PANEL}>
          <SectionLabel>Cụm từ</SectionLabel>
          <PhraseTable view={view} />
        </section>
      )}
      {/* Without per-sense groups the rows name themselves "Đồng nghĩa" and "Trái nghĩa". */}
      {derived && hasSynonyms(others) && (
        <section className={PANEL}>
          {others.senseSynonyms.length > 0 && <SectionLabel>Đồng nghĩa theo từng nghĩa</SectionLabel>}
          <SynonymsRows view={others} />
        </section>
      )}
      {view.family.length + view.related.length > 0 && (
        <section className={PANEL}>
          <SectionLabel>Họ từ</SectionLabel>
          <FamilyRows family={view.family} related={view.related} />
        </section>
      )}
      {derived && <CrossLanguagePanel siblings={view.siblings} className={`${CARD} p-4 sm:p-5`} />}
      {hasOrigin && (
        <section className={PANEL}>
          <SectionLabel>Nguồn gốc</SectionLabel>
          <OriginNotes notes={view.notes} leadPos={leadPos} />
        </section>
      )}
      <Backlinks view={view} />
    </>
  )
}

/** Characters four lines hold in the narrowest rail, a 390 px phone; a longer note folds. */
const NOTE_FOLD = 160

function UsageNote({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const long = text.length > NOTE_FOLD
  return (
    <>
      <p className={`text-[14.5px] leading-relaxed text-(--zs-soft) ${long && !expanded ? 'line-clamp-4' : ''}`}>{text}</p>
      {long && <MoreButton expanded={expanded} label="Đọc tiếp" onClick={() => setExpanded((v) => !v)} />}
    </>
  )
}

/** A list showing its first `shown` rows, with a button for the rest. */
export function FoldedList({ rows, shown, noun, className }: { rows: React.ReactNode[]; shown: number; noun: string; className: string }) {
  const [expanded, setExpanded] = useState(false)
  const hidden = rows.length - shown
  return (
    <>
      <ul className={className}>{expanded || hidden <= 0 ? rows : rows.slice(0, shown)}</ul>
      {hidden > 0 && <MoreButton expanded={expanded} label={`Xem thêm ${hidden} ${noun}`} onClick={() => setExpanded((v) => !v)} />}
    </>
  )
}

export const BACKLINKS_LABEL = 'Xuất hiện ở từ khác'

/** The layers of other words that mention this one, drawn in the card of whichever layout
 *  shows it. */
export function Backlinks({ view, className = PANEL }: { view: Pick<WordView, 'backlinks' | 'head'>; className?: string }) {
  if (view.backlinks.length === 0) return null
  return (
    <section className={className}>
      <SectionLabel>{BACKLINKS_LABEL}</SectionLabel>
      <BacklinkList view={view} />
    </section>
  )
}

/** Backlinks a list shows before expanding: take has 24. */
const SHOWN_BACKLINKS = 6

export function BacklinkList({ view }: { view: Pick<WordView, 'backlinks' | 'head'> }) {
  const [expanded, setExpanded] = useState(false)
  const hidden = view.backlinks.length - SHOWN_BACKLINKS
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2 text-sm">
        {(expanded ? view.backlinks : view.backlinks.slice(0, SHOWN_BACKLINKS)).map((b) => (
          <li key={b.entryId} className="flex flex-col">
            <span className="flex flex-wrap items-baseline gap-x-2">
              <Mention link={{ text: b.headword, targetEntryId: b.entryId }} />
              {b.lang !== view.head.lang && <span className="text-[11px] text-(--zs-soft)">{LANG_LABELS[b.lang]}</span>}
              <span className="text-xs text-(--zs-soft)">{b.kinds.map((k) => LINK_KIND_VI[k]).join(', ')}</span>
            </span>
            {b.note && <span className="text-[13px] text-(--zs-soft)">{b.note}</span>}
          </li>
        ))}
      </ul>
      {hidden > 0 && <MoreButton expanded={expanded} label={`Xem thêm ${hidden} từ`} onClick={() => setExpanded((v) => !v)} />}
    </div>
  )
}

/** The entry's phrases, with a word on the ones the model wrote: every collocation
 *  relation is model-written (71,866 of 71,866 on 2026-09-29). */
export function PhraseTable({ view }: { view: WordView }) {
  return (
    <>
      <WordTable words={view.phrases} head="Cụm từ" shown={6} />
      {view.modelPhrases > 0 && <p className="text-xs text-(--zs-soft)">Một số cụm từ do AI gợi ý.</p>}
    </>
  )
}

/** The datasets a derived layer's examples come from, by `lex.sources.id`. */
const EXAMPLE_SOURCES: Record<string, string> = {
  'wiktionary-en': 'Wiktionary', 'wiktionary-es': 'Wiktionary', tatoeba: 'Tatoeba', oewn: 'WordNet',
}

/** "A", "A và B", "A, B và C". */
const listVi = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} và ${names.at(-1)}`)

/** Said once per layout: where the layer came from. A model wrote an AI layer. A derived one
 *  says what its own senses and examples are: the dictionary, whether their Vietnamese is
 *  machine-translated (all, some or none of it) or missing, and where each example is from.
 *  A model-written example carries its own label instead. */
export function layerNote(layer: Pick<LearnerLayer, 'source' | 'senses'>, view: Pick<WordView, 'head' | 'senses'>): string {
  const from = sourceName(view.head.lang)
  if (layer.source === 'ai') return `AI soạn nghĩa chính, ví dụ và kết hợp từ ${from}. Một mô hình AI khác đã soát lại.`
  const own = view.senses.filter((s) => fromDictionary(s) && !isClassifierGloss(s.glossEn))
  if (own.length === 0) return 'Nghĩa do AI soạn.'
  const direct = own.filter((s) => s.glossVi)
  const pivoted = own.filter((s) => !s.glossVi && s.pivotVi)
  const mt = direct.filter((s) => s.glossViIsMt)
  const vi = direct.length + pivoted.length === 0 ? 'Chưa có nghĩa tiếng Việt.'
    : mt.length === 0 ? null
      : mt.length === direct.length && pivoted.length === 0 ? 'Nghĩa tiếng Việt do máy dịch.'
        : 'Một số nghĩa tiếng Việt do máy dịch.'
  const names = [...new Set(layer.senses.flatMap((s) => s.examples)
    .flatMap((x) => (x.sourceId && Object.hasOwn(EXAMPLE_SOURCES, x.sourceId) ? [EXAMPLE_SOURCES[x.sourceId]] : [])))]
  const examples = names.length > 0 ? `Ví dụ lấy từ ${listVi(names)}.` : null
  return [`Nghĩa lấy từ ${from}.`, examples, vi].filter(Boolean).join(' ')
}

export function LayerNote({ layer, view }: { layer: Pick<LearnerLayer, 'source' | 'senses'>; view: Pick<WordView, 'head' | 'senses'> }) {
  return <p className="text-xs text-(--zs-soft)">{layerNote(layer, view)}</p>
}
