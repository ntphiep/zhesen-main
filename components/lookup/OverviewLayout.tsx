'use client'
import { useState } from 'react'
import { LookupHero } from './LookupHero'
import { LemmaLink } from './LemmaLink'
import { CharacterPanel } from './CharacterPanel'
import { ConjugationTable } from './ConjugationTable'
import { CrossLanguagePanel } from './CrossLanguagePanel'
import { BACKLINKS_LABEL, BacklinkList, LayerNote } from './LearnerParts'
import {
  AiCorner, Badge, CARD, CONTAINER, Card, EnglishMark, ExampleRows, FamilyRows, FormLegend, FormTimeline, GrammarList, IrregularNote,
  LevelChip, PhrasesCard, PivotMark, PosChip, SectionLabel, SynonymsRows, UntranslatedNote, baseFormLabel, hasSynonyms,
} from './WordParts'
import { parseClassifiers } from '@/lib/dictionary/textQuality'
import { senseSections, type SenseSection } from '@/lib/dictionary/wordPage'
import {
  balanceColumns, cleanExamples, groupSenses, headwordForms, mainSenses, splitPhrasalVerbs, translatedFirst, type WordView,
} from '@/lib/dictionary/wordView'

/** A tile, its estimated height in text rows, and whether it needs the wider column. */
interface TileSpec { key: string; rows: number; wide: boolean; node: React.ReactNode }

const SPAN = { 3: 'lg:col-span-3', 4: 'lg:col-span-4', 5: 'lg:col-span-5', 7: 'lg:col-span-7', 9: 'lg:col-span-9', 12: 'lg:col-span-12' } as const

const SHOWN_GROUPS = 6
const MAIN_LINES = 4
const SHOWN_FAMILY = 4

interface MainLine { key: string; text: string; pos: string | null; cefr: string | null; en: string | null; mark: 'pivot' | 'english' | null }

/**
 * The whole word on one screen, as cards on a pastel page: the headword, its main meanings
 * and the other languages across the top, then every kind of related word in two columns
 * that end close together. On a phone the cards stack under a bar of jump links.
 */
export function OverviewLayout({ view }: { view: WordView }) {
  const { head } = view
  const sections = senseSections(view.senses)
  const total = sections.reduce((n, s) => n + s.senses.length, 0)
  // A published layer names the senses a learner meets first, each with its own level.
  const layer = view.learner?.source === 'ai' && view.learner.senses.length > 0 ? view.learner.senses.slice(0, MAIN_LINES) : null
  const leadSenses = layer ? [] : mainSenses(sections, MAIN_LINES).flatMap((g) => g.senses)
  const lines: MainLine[] = layer
    ? layer.map((s) => ({
      key: `layer-${s.order}`, text: s.viTerms.join(', '), pos: s.pos, cefr: s.cefr, en: s.enDefinition, mark: s.pivot ? 'pivot' : null,
    }))
    : leadSenses.map((s, i) => ({
      key: s.id ?? `${s.senseOrder}-${i}`, text: s.glossVi ?? s.pivotVi ?? s.glossEn ?? '', pos: s.pos, cefr: null,
      en: s.glossVi || s.pivotVi ? s.glossEn : null, mark: s.glossVi ? null : s.pivotVi ? 'pivot' : 'english',
    }))
  const classifiers = [...new Set(view.senses.flatMap((s) => parseClassifiers(s.glossEn)))]
  // The explorer holds what the top card leaves out: give up's "từ bỏ" senses were read twice.
  const covered = new Set(layer?.flatMap((s) => s.sourceSenseIds))
  const rest = sections
    .map((sec) => ({ ...sec, senses: sec.senses.filter((s) => !leadSenses.includes(s) && !(s.id && covered.has(s.id))) }))
    .filter((sec) => sec.senses.length > 0)
  const restCount = rest.reduce((n, s) => n + s.senses.length, 0)
  const explorer = restCount > 0
  // The sense-linked sentences lead, but an untranslated one never goes ahead of a translated one.
  const examples = translatedFirst(cleanExamples([...Object.values(view.examplesBySense), ...view.examples], view.resolved, head.lang), view.glosses)
  const heroSpan = lines.length === 0 ? 12 : 5
  const { phrasal, other } = head.lang === 'en'
    ? splitPhrasalVerbs(head.headword, view.phrases)
    : { phrasal: [], other: view.phrases }
  const synonymRows = view.senseSynonyms.length + (view.synonyms.length > 0 ? 1 : 0)
  const irregular = view.forms.some((f) => f.irregular)

  const tiles = ([
    head.lang === 'zh' && view.characters.length > 0 && {
      key: 'characters', wide: false, rows: 3 + 3 * new Set(view.characters.map((c) => c.char)).size,
      node: <Card id="characters" label="Chữ và bộ thủ"><CharacterPanel characters={view.characters} /></Card>,
    },
    view.forms.length > 0 && {
      key: 'forms', wide: true, rows: 5 + (irregular ? 2 : 0),
      node: (
        <Card
          id="forms"
          label={<span className="flex items-center gap-2.5"><SectionLabel>Dạng từ</SectionLabel>{irregular && <Badge tone="strong">Bất quy tắc</Badge>}</span>}
          action={<FormLegend irregular={irregular} />}
        >
          <FormTimeline headword={head.headword} baseLabel={baseFormLabel(view.forms)} forms={view.forms} lang={head.lang} />
          <IrregularNote forms={view.forms} />
        </Card>
      ),
    },
    hasSynonyms(view) && {
      key: 'synonyms', wide: false, rows: 1 + 2 * Math.min(synonymRows, 4) + (view.antonyms.length > 0 ? 2 : 0),
      node: (
        <Card id="synonyms" label={view.senseSynonyms.length > 0 ? 'Đồng nghĩa theo từng nghĩa' : 'Đồng nghĩa'}>
          <SynonymsRows view={view} />
        </Card>
      ),
    },
    view.phrases.length > 0 && {
      key: 'phrases', wide: true,
      rows: phrasal.length > 0 ? 3 + Math.ceil(Math.min(phrasal.length, 8) / 4) * 4 : 3 + 1.5 * Math.min(other.length, 8),
      node: <PhrasesCard headword={head.headword} lang={head.lang} phrases={view.phrases} />,
    },
    (view.family.length > 0 || view.related.length > 0) && {
      key: 'family', wide: false, rows: 2 + 2 * Math.min(view.family.length, SHOWN_FAMILY) + (view.related.length > 0 ? 3 : 0),
      node: (
        <Card
          id="family"
          label={
            <span className="flex items-baseline gap-2">
              <SectionLabel>Họ từ</SectionLabel>
              {view.family.length > 0 && <span className="text-xs text-(--zs-soft)">cùng gốc <b className="font-semibold text-(--zs-ink)">{view.lemma ?? head.headword}</b></span>}
            </span>
          }
        >
          <FamilyRows family={view.family} related={view.related} shown={SHOWN_FAMILY} />
        </Card>
      ),
    },
    explorer && {
      key: 'senses', wide: true, rows: 6 + 2 * rest.length,
      node: (
        <Card id="senses" label={restCount === total ? `Tất cả ${total} nghĩa, theo nhóm` : `${restCount} nghĩa khác, theo nhóm`}>
          <SenseExplorer sections={rest} />
        </Card>
      ),
    },
    view.siblings.length > 0 && {
      key: 'other-languages', wide: false, rows: 2 + 2 * view.siblings.length,
      node: (
        <div id="other-languages" className="min-w-0 max-lg:scroll-mt-16">
          <CrossLanguagePanel siblings={view.siblings} className={`p-5 sm:p-6 ${CARD}`} />
        </div>
      ),
    },
    examples.length > 0 && {
      key: 'examples', wide: false, rows: 1 + 2.5 * Math.min(examples.length, 3),
      node: (
        <Card id="examples" label="Ví dụ">
          <ExampleRows examples={examples} lang={head.lang} resolved={view.resolved} glosses={view.glosses} mark={headwordForms(view)} />
        </Card>
      ),
    },
    view.grammarPoints.length > 0 && {
      key: 'grammar', wide: false, rows: 1 + 2 * view.grammarPoints.length,
      node: <Card label="Ngữ pháp"><GrammarList points={view.grammarPoints} /></Card>,
    },
    view.backlinks.length > 0 && {
      key: 'backlinks', wide: false, rows: 2 + 2 * Math.min(view.backlinks.length, 6),
      node: <Card id="backlinks" label={BACKLINKS_LABEL}><BacklinkList view={view} /></Card>,
    },
  ] satisfies (TileSpec | false)[]).filter((t) => t !== false)
  const sides = balanceColumns(tiles.map((t) => t.rows), tiles.map((t) => t.wide))
  const columns = ([0, 1] as const).filter((side) => sides.includes(side))

  // One row for the sections a learner jumps to; the rest are a scroll away.
  const jumps = [
    lines.length > 0 && { href: '#meaning', label: 'Nghĩa' },
    view.phrases.length > 0 && { href: '#phrases', label: 'Cụm từ' },
    examples.length > 0 && { href: '#examples', label: 'Ví dụ' },
  ].filter((j) => j !== false)

  return (
    <>
      {jumps.length > 1 && (
        <nav aria-label="Mục trong trang" className="sticky top-[var(--header-h)] z-10 border-b border-(--zs-line) bg-(--zs-bg)/88 backdrop-blur lg:hidden">
          <div className={`${CONTAINER} flex gap-1.5 overflow-x-auto py-2`}>
            {jumps.map((j) => (
              <a key={j.href} href={j.href} className="shrink-0 rounded-full bg-(--zs-chip) px-3.5 py-1.5 text-[13px] font-medium text-(--zs-soft)">
                {j.label}
              </a>
            ))}
          </div>
        </nav>
      )}
      <div className={`${CONTAINER} grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5`}>
        <div className={`flex min-w-0 flex-col gap-4 rounded-[18px] bg-(--c-t) p-6 sm:p-7 ${SPAN[heroSpan]}`}>
          <LookupHero
            detail={head}
            hanViet={view.hanViet}
            summary={lines.length > 0 ? null : view.summary}
            posLabels={sections.filter((s) => s.key).map((s) => s.labelVi)}
          />
          {view.lemma && <LemmaLink lemma={view.lemma} preview={view.lemmaPreview ?? undefined} lang={head.lang} />}
        </div>

        {lines.length > 0 && (
          <Card
            id="meaning"
            label="Nghĩa chính"
            className={SPAN[7]}
            action={explorer ? <a href="#senses" className="text-[13px] font-semibold text-(--zs-pen) hover:underline">Thêm {restCount} nghĩa</a> : undefined}
          >
            <ol className="flex flex-col">
              {lines.map((l, i) => (
                <li key={l.key} className="flex gap-3.5 border-t border-(--zs-line) py-3 first:border-0 first:pt-0 last:pb-0">
                  <span aria-hidden="true" className="w-3 shrink-0 pt-0.5 text-sm font-medium tabular-nums text-(--zs-soft)">{i + 1}</span>
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold">
                        {l.text}
                        {l.mark === 'pivot' && <PivotMark />}
                        {l.mark === 'english' && <EnglishMark />}
                      </span>
                      <PosChip value={l.pos} />
                      <LevelChip level={l.cefr} />
                    </span>
                    {l.en && <span className="text-[12.5px] leading-snug text-(--zs-soft)">{l.en}</span>}
                  </div>
                </li>
              ))}
            </ol>
            <UntranslatedNote senses={view.senses} />
            {view.learner && <LayerNote layer={view.learner} view={view} />}
            {classifiers.length > 0 && (
              <p className="flex flex-wrap items-center gap-2 border-t border-(--zs-line) pt-3 text-sm">
                <span className="text-xs text-(--zs-soft)">Lượng từ</span>
                {classifiers.map((c) => <span key={c} className="rounded-full bg-(--zs-chip) px-2.5 py-0.5 font-medium">{c}</span>)}
              </p>
            )}
          </Card>
        )}

        {/* Wider than either column, so it takes a row of its own. */}
        {view.conjugation && (
          <Card label="Chia động từ" className="overflow-x-auto lg:col-span-12">
            <ConjugationTable conjugation={view.conjugation} />
          </Card>
        )}

        {columns.map((side) => (
          <div key={side} className={`flex min-w-0 flex-col gap-4 lg:gap-5 ${columns.length === 1 ? SPAN[12] : side === 0 ? SPAN[7] : SPAN[5]}`}>
            {tiles.map((t, i) => sides[i] === side && <div key={t.key} data-reveal={Math.min(i, 6)} className="min-w-0">{t.node}</div>)}
          </div>
        ))}
        {/* Out of the balancing: it renders nothing where the assistant is off, which would
            leave its column empty. */}
        <div className="min-w-0 lg:col-span-12">
          <AiCorner lang={head.lang} headword={head.headword} meaningVi={view.meaningVi} />
        </div>
      </div>
    </>
  )
}

/** Every sense, gathered by part of speech and then by the Vietnamese term it leads with.
 *  One group is open at a time, in the box under the chips. */
function SenseExplorer({ sections }: { sections: SenseSection[] }) {
  const rows = sections.map((sec) => ({ sec, groups: groupSenses(sec.senses) })).filter((r) => r.groups.length > 0)
  const [picked, setPicked] = useState({ row: 0, group: 0 })
  const [open, setOpen] = useState<string[]>([])
  const current = rows[picked.row]?.groups[picked.group]
  return (
    <div className="flex flex-col gap-4">
      {rows.map(({ sec, groups }, ri) => {
        const all = open.includes(sec.key)
        return (
          <div key={sec.key} className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1.5 text-sm font-semibold">
              {sec.labelVi} <span className="font-normal text-(--zs-soft)">{sec.senses.length}</span>
            </span>
            {(all ? groups : groups.slice(0, SHOWN_GROUPS)).map((g, gi) => {
              const on = picked.row === ri && picked.group === gi
              return (
                <button
                  key={g.label}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked({ row: ri, group: gi })}
                  className={`rounded-full px-3 py-1 text-[13px] transition-colors duration-150 ease-std ${on ? 'bg-(--zs-btn) font-semibold text-(--zs-btn-ink)' : 'bg-(--zs-chip) hover:bg-(--tint-3)'}`}
                >
                  {g.label}
                </button>
              )
            })}
            {groups.length > SHOWN_GROUPS && (
              <button
                type="button"
                aria-expanded={all}
                onClick={() => {
                  setOpen((o) => (all ? o.filter((k) => k !== sec.key) : [...o, sec.key]))
                  if (all && picked.row === ri && picked.group >= SHOWN_GROUPS) setPicked({ row: ri, group: 0 })
                }}
                className="rounded-full border border-(--zs-line) px-3 py-1 text-[13px] text-(--zs-soft) hover:bg-(--tint-1)"
              >
                {all ? 'Thu gọn' : `+ ${groups.length - SHOWN_GROUPS} nhóm`}
              </button>
            )}
          </div>
        )
      })}
      {current && (
        <div key={`${picked.row}-${picked.group}`} data-swap="" className="flex flex-col gap-2 rounded-[14px] bg-(--tint-2) p-4">
          <span className="text-[15px] font-semibold">{current.label}</span>
          <ol className="flex flex-col gap-2">
            {current.senses.map((s, i) => {
              const vi = s.glossVi ?? s.pivotVi
              return (
                <li key={s.id ?? `${s.senseOrder}-${i}`} className="flex flex-col text-sm">
                  {vi && vi !== current.label && <span>{vi}{!s.glossVi && <PivotMark />}</span>}
                  {s.glossEn && (vi
                    ? <span className="text-(--zs-soft)">{s.glossEn}</span>
                    : <span>{s.glossEn}<EnglishMark /></span>)}
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </div>
  )
}
