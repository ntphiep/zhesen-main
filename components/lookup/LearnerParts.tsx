import { AddToWordlistButton } from './AddToWordlistButton'
import { CrossLanguagePanel } from './CrossLanguagePanel'
import { saveableEntry } from './LookupHero'
import { Pronunciation } from './Pronunciation'
import {
  CARD, CONTAINER, FamilyRows, FrequencyMeter, LevelChip, PivotMark, PosChip, SectionLabel, SynonymsRows, WordLink, WordTable,
  hasSynonyms,
} from './WordParts'
import { AudioButton } from '@/components/ui/AudioButton'
import { entryPath } from '@/lib/dictionary/entryId'
import { genderLabel } from '@/lib/dictionary/gender'
import { LANG_LABELS } from '@/lib/dictionary/labels'
import {
  LINK_KIND_VI, domainLabel, formDescriptionVi, markHeadword, registerLabel, sourceNumbers,
  type LearnerExample, type LearnerLayer, type LearnerLink, type LearnerSense, type MinorSense,
} from '@/lib/dictionary/learner'
import { posGroups } from '@/lib/dictionary/pos'
import { isClassifierGloss } from '@/lib/dictionary/textQuality'
import { headwordForms, type WordView } from '@/lib/dictionary/wordView'
import type { LangCode } from '@/lib/languages'

/** Pieces the three learner-layer layouts share, after the prototype the owner approved. */

export const PANEL = `${CARD} flex flex-col gap-2.5 p-4 sm:p-5`

/** One colour per core sense, for the layout that links everything by colour. */
export const SENSE_TONES = [
  { badge: 'bg-blue-700 text-white', edge: 'border-l-blue-700', ring: 'ring-blue-700' },
  { badge: 'bg-emerald-700 text-white', edge: 'border-l-emerald-700', ring: 'ring-emerald-700' },
  { badge: 'bg-amber-700 text-white', edge: 'border-l-amber-700', ring: 'ring-amber-700' },
  { badge: 'bg-violet-700 text-white', edge: 'border-l-violet-700', ring: 'ring-violet-700' },
  { badge: 'bg-rose-700 text-white', edge: 'border-l-rose-700', ring: 'ring-rose-700' },
] as const

export const toneOf = (order: number) => SENSE_TONES[(order - 1) % SENSE_TONES.length]

const CHIP = {
  neutral: 'bg-black/[0.05] text-black/60',
  domain: 'bg-amber-50 text-amber-700',
  register: 'bg-violet-50 text-violet-700',
  form: 'bg-emerald-50 text-emerald-700',
} as const

export function Chip({ tone = 'neutral', children }: { tone?: keyof typeof CHIP; children: React.ReactNode }) {
  return <span className={`shrink-0 rounded-full px-[7px] py-0.5 text-[11px] ${CHIP[tone]}`}>{children}</span>
}

/** Part of speech, level, subject field and register, whichever the sense has. */
export function SenseChips({ pos, cefr, domain, register, children }: {
  pos?: string | null
  cefr?: string | null
  domain: string | null
  register: string | null
  children?: React.ReactNode
}) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {children}
      <PosChip value={pos} />
      <LevelChip level={cefr ?? null} />
      {domain && <Chip tone="domain">{domainLabel(domain)}</Chip>}
      {register && <Chip tone="register">{registerLabel(register)}</Chip>}
    </span>
  )
}

/** A word the layer mentions: a link when the dictionary holds it, plain text otherwise. */
export function Mention({ link, className = '' }: { link: Pick<LearnerLink, 'text' | 'targetEntryId'>; className?: string }) {
  if (!link.targetEntryId) return <span className={`font-semibold ${className}`}>{link.text}</span>
  return (
    <WordLink
      word={{ text: link.text, href: entryPath(link.targetEntryId) }}
      className={`mention font-semibold text-blue-700 hover:underline ${className}`}
    />
  )
}

function Marked({ text, view }: { text: string; view: WordView }) {
  const parts = markHeadword(text, view.head.headword, view.head.lang, headwordForms(view))
  return <>{parts.map((p, i) => (p.mark ? <b key={i} className="font-bold text-blue-700">{p.text}</b> : p.text))}</>
}

export function ExampleCard({ example, view }: { example: LearnerExample; view: WordView }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-0.5 rounded-xl bg-black/[0.035] px-3.5 py-2.5">
      <span className="text-[15px]"><Marked text={example.text} view={view} /></span>
      <span className="-my-1.5"><AudioButton text={example.text} lang={view.head.lang} /></span>
      {example.reading && <span className="col-start-1 text-[13px] text-black/60">{example.reading}</span>}
      <span className="col-start-1 text-sm text-black/70">{example.vi}</span>
      {example.byModel && (
        <span className="col-start-1 text-[10.5px] font-medium uppercase tracking-wide text-black/60">câu soạn mới</span>
      )}
    </li>
  )
}

export function Examples({ examples, view }: { examples: LearnerExample[]; view: WordView }) {
  if (examples.length === 0) return null
  return <ul className="flex flex-col gap-2">{examples.map((x, i) => <ExampleCard key={i} example={x} view={view} />)}</ul>
}

/** A collocation's meaning, then its example with the example's own pinyin and translation. */
export function CollocationGloss({ link }: { link: LearnerLink }) {
  return (
    <>
      {link.vi && <span className="block text-[13.5px] text-black/80 sm:text-sm">{link.vi}</span>}
      {link.example && <span className="block text-[13px] text-black/70">{link.example}</span>}
      {link.exampleReading && <span className="block text-xs text-black/60">{link.exampleReading}</span>}
      {link.exampleVi && <span className="block text-[13px] text-black/65">{link.exampleVi}</span>}
    </>
  )
}

/** Fixed columns, so the tables of every sense on a page line up. */
function CollocationTable({ links }: { links: LearnerLink[] }) {
  return (
    <table className="w-full border-collapse text-sm sm:table-fixed">
      <colgroup>
        <col className="sm:w-[34%]" />
        <col className="sm:w-28" />
        <col />
      </colgroup>
      <tbody>
        {links.map((k) => (
          <tr key={k.text} className="border-t border-black/[0.06] align-top first:border-0">
            <td className="break-words py-2.5 pr-3">
              <Mention link={k} />
              {k.reading && <span className="block text-xs text-black/60">{k.reading}</span>}
              {k.pattern && <span className="block font-mono text-[11px] text-black/60 sm:hidden">{k.pattern}</span>}
            </td>
            <td className="hidden break-words py-2.5 pr-3 pt-3 font-mono text-[11px] text-black/60 sm:table-cell">{k.pattern}</td>
            <td className="py-2.5">
              <CollocationGloss link={k} />
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
          <span className="text-[13.5px] text-black/70">{x.noteVi}</span>
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
          <span className="mr-1.5 text-[11px] text-black/60">{LANG_LABELS[g.lang]}</span>
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
        <SenseChips pos={sense.pos} cefr={sense.cefr} domain={sense.domain} register={sense.register} />
        <h2 className={`font-bold leading-tight tracking-[-0.015em] ${TERMS[size]}`}>
          {sense.viTerms.join(', ')}{sense.pivot && <PivotMark />}
        </h2>
        {sense.viDefinition && <p className="text-[15.5px] leading-relaxed">{sense.viDefinition}</p>}
        {sense.enDefinition && <p className="text-[13.5px] text-black/60">{sense.enDefinition}</p>}
      </div>
      <Examples examples={sense.examples} view={view} />
      {sense.collocations.length > 0 && <Block label="Kết hợp hay gặp"><CollocationTable links={sense.collocations} /></Block>}
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
  return <p className="text-[11px] text-black/60">Từ nghĩa {numbers} của {sourceName(view.head.lang)}</p>
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
      <SenseChips pos={minor.pos} domain={minor.domain} register={minor.register}>
        {minor.isInflection && <Chip tone="form">dạng từ</Chip>}
      </SenseChips>
      <h2 className="text-[28px] font-bold leading-tight tracking-[-0.015em] sm:text-[30px]">{minorTerms(minor)}</h2>
      {minor.isInflection && minor.lemma && (
        <p className="text-[15.5px]">Là một dạng của <LemmaMention minor={minor} />.</p>
      )}
      {minor.glossEn && <p className="text-[13.5px] text-black/60">{minorGloss(minor)}</p>}
      <SourceLine ids={[minor.senseId]} view={view} />
    </div>
  )
}

/** The headword block every learner layout opens with, as compact as the prototype's: the
 *  word with its level and parts of speech, its sound, the layer's short equivalents in
 *  bold, and the save button with what the layer holds beside them. */
export function LearnerHeader({ view, layer, minor, forms }: { view: WordView; layer: LearnerLayer; minor: number; forms: number }) {
  const head = view.head
  const posLabels = posGroups(layer.senses.map((s) => s.pos)).map((g) => g.labelVi)
  const collocations = layer.senses.reduce((n, s) => n + s.collocations.length, 0)
  const stats = [
    { n: layer.senses.length, label: 'nghĩa chính' },
    { n: minor, label: 'nghĩa khác' },
    { n: forms, label: 'dạng từ' },
    { n: collocations, label: 'kết hợp' },
  ].filter((s) => s.n > 0)
  const gender = genderLabel(head.attributes)
  const pinyin = typeof head.attributes.pinyin === 'string' ? head.attributes.pinyin : null
  // As in LookupHero: the pronunciation row carries the pinyin when there is one.
  const showPinyin = pinyin !== null && !head.pronunciations.some((p) => p.ipa?.trim())
  return (
    <div className={CONTAINER}>
      <header className="grid grid-cols-1 gap-x-6 gap-y-2.5 border-b border-black/10 pb-5 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3.5 gap-y-2">
          <h1 className={`min-w-0 break-words font-extrabold leading-[0.95] tracking-[-0.045em] ${
            [...head.headword].length > 12 ? 'text-[34px] sm:text-[44px]' : 'text-[44px] sm:text-[60px]'
          }`}>
            {head.headword}
          </h1>
          {head.traditional && head.traditional !== head.headword && (
            <span className="text-[28px] text-black/60 sm:text-[34px]">{head.traditional}</span>
          )}
          <span className="flex flex-wrap items-center gap-1.5">
            <LevelChip level={head.level ?? layer.level} strong />
            {gender && <Chip>{gender}</Chip>}
            {posLabels.map((p) => <Chip key={p}>{p.toLocaleLowerCase('vi')}</Chip>)}
            <FrequencyMeter rank={head.frequencyRank} small />
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          {showPinyin && <span className="font-medium text-black/70">{pinyin}</span>}
          {view.hanViet && <span className="italic text-black/70">Hán-Việt: {view.hanViet}</span>}
          <Pronunciation headword={head.headword} prons={head.pronunciations} lang={head.lang} />
        </div>
        {layer.gistVi.length > 0 && (
          <p className="text-[21px] font-semibold leading-snug tracking-[-0.01em] text-balance sm:text-2xl">
            {layer.gistVi.map((g, i) => (
              <span key={g}>{i > 0 && <span aria-hidden="true" className="font-normal text-black/55"> · </span>}{g}</span>
            ))}
          </p>
        )}
        <div className="flex flex-col items-start gap-2 pt-1 sm:col-start-2 sm:row-span-3 sm:row-start-1 sm:items-end sm:pt-0">
          <AddToWordlistButton size="lg" entry={saveableEntry(head)} />
          {stats.length > 0 && (
            <p className="text-[12.5px] text-black/60 sm:text-right">
              {stats.map((s, i) => (
                <span key={s.label}>{i > 0 && ' · '}<b className="font-semibold text-black">{s.n}</b> {s.label}</span>
              ))}
            </p>
          )}
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
  return (
    <>
      {layer.usageNoteVi && (
        <section className={PANEL}>
          <SectionLabel>Mô tả chung</SectionLabel>
          <p className="text-[14.5px] leading-relaxed text-black/75">{layer.usageNoteVi}</p>
        </section>
      )}
      {layer.confusables.length > 0 && (
        <section className={PANEL}>
          <SectionLabel>Dễ nhầm với</SectionLabel>
          <NoteList links={layer.confusables} />
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
      <Backlinks view={view} />
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

export function BacklinkList({ view }: { view: Pick<WordView, 'backlinks' | 'head'> }) {
  return (
      <ul className="flex flex-col gap-2 text-sm">
        {view.backlinks.map((b) => (
          <li key={b.entryId} className="flex flex-col">
            <span className="flex flex-wrap items-baseline gap-x-2">
              <Mention link={{ text: b.headword, targetEntryId: b.entryId }} />
              {b.lang !== view.head.lang && <span className="text-[11px] text-black/60">{LANG_LABELS[b.lang]}</span>}
              <span className="text-xs text-black/60">{b.kinds.map((k) => LINK_KIND_VI[k]).join(', ')}</span>
            </span>
            {b.note && <span className="text-[13px] text-black/70">{b.note}</span>}
          </li>
        ))}
      </ul>
  )
}

/** The entry's phrases, with a word on the ones the model wrote: every collocation
 *  relation is model-written (71,866 of 71,866 on 2026-09-29). */
export function PhraseTable({ view }: { view: WordView }) {
  return (
    <>
      <WordTable words={view.phrases} head="Cụm từ" shown={6} />
      {view.modelPhrases > 0 && <p className="text-xs text-black/60">Một số cụm từ do AI gợi ý.</p>}
    </>
  )
}

/** The datasets a derived layer's examples come from, by `lex.sources.id`. */
const EXAMPLE_SOURCES: Record<string, string> = {
  'wiktionary-en': 'Wiktionary', 'wiktionary-es': 'Wiktionary', tatoeba: 'Tatoeba', cambridge: 'Cambridge', oewn: 'WordNet',
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
  return <p className="text-xs text-black/60">{layerNote(layer, view)}</p>
}
