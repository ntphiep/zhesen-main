import { LookupHero } from './LookupHero'
import { LemmaLink } from './LemmaLink'
import { SenseList } from './SenseList'
import { CharacterPanel } from './CharacterPanel'
import { ConjugationTable } from './ConjugationTable'
import { CrossLanguagePanel } from './CrossLanguagePanel'
import { ExampleList } from './ExampleList'
import { GrammarLinks } from './GrammarLinks'
import { AiCorner, FamilyBlock, FormsBlock, PhrasesBlock, SynonymsBlock, Tile, hasSynonyms } from './WordParts'
import { parseClassifiers } from '@/lib/dictionary/textQuality'
import { senseSections, SHOWN_SENSES } from '@/lib/dictionary/wordPage'
import { balanceColumns, mainSenses, splitPhrasalVerbs, type WordView } from '@/lib/dictionary/wordView'

/** A tile and its estimated height in text rows, which decides its column. */
interface TileSpec { key: string; rows: number; node: React.ReactNode }

const SPAN = { 3: 'lg:col-span-3', 4: 'lg:col-span-4', 5: 'lg:col-span-5', 7: 'lg:col-span-7', 9: 'lg:col-span-9', 12: 'lg:col-span-12' } as const

const rowsOf = (items: number, perRow: number, cap: number) => Math.ceil(Math.min(items, cap) / perRow)

/**
 * The whole word on one screen: the headword, its main meanings and the other languages
 * across the top, then every kind of related word as a tile in two columns that end close
 * together. On a phone the columns stack.
 */
export function OverviewLayout({ view }: { view: WordView }) {
  const { head } = view
  const sections = senseSections(view.senses)
  const total = sections.reduce((n, s) => n + s.senses.length, 0)
  const main = mainSenses(sections)
  const mainCount = main.reduce((n, g) => n + g.senses.length, 0)
  const classifiers = [...new Set(view.senses.flatMap((s) => parseClassifiers(s.glossEn)))]
  // With every sense already in the top tile, the list below would repeat it, and the
  // examples it carries join the others instead.
  const fullList = total > mainCount
  const examples = fullList ? view.examples : [...Object.values(view.examplesBySense), ...view.examples]
  const siblings = view.siblings.length > 0
  const heroSpan = main.length === 0 ? (siblings ? 9 : 12) : 5
  const mainSpan = siblings ? 4 : 7
  const { phrasal, other } = head.lang === 'en'
    ? splitPhrasalVerbs(head.headword, view.phrases)
    : { phrasal: [], other: view.phrases }
  const synonymRows = [...view.senseSynonyms.map((s) => s.words.length), view.synonyms.length, view.antonyms.length]

  const tiles = ([
    head.lang === 'zh' && view.characters.length > 0 && {
      key: 'characters', rows: 3 + 3 * new Set(view.characters.map((c) => c.char)).size,
      node: <div className="rounded-xl border border-black/10 p-4"><CharacterPanel characters={view.characters} /></div>,
    },
    view.forms.length > 0 && {
      key: 'forms', rows: 3,
      node: <Tile title="Dạng từ" id="forms"><FormsBlock forms={view.forms} lang={head.lang} /></Tile>,
    },
    hasSynonyms(view) && {
      key: 'synonyms', rows: 1 + synonymRows.reduce((n, k) => n + rowsOf(k, 3, 10), 0),
      node: <Tile title="Đồng nghĩa" id="synonyms"><SynonymsBlock view={view} /></Tile>,
    },
    view.phrases.length > 0 && {
      key: 'phrases', rows: 2 + rowsOf(phrasal.length, 3, 6) * 2 + Math.min(other.length, 6),
      node: (
        <Tile title="Cụm từ" id="phrases" action={<Count n={view.phrases.length} />}>
          <PhrasesBlock headword={head.headword} lang={head.lang} phrases={view.phrases} />
        </Tile>
      ),
    },
    (view.family.length > 0 || view.related.length > 0) && {
      key: 'family', rows: 2 + Math.min(view.family.length, 6) + (view.related.length > 0 ? 1 + rowsOf(view.related.length, 3, 10) : 0),
      node: (
        <Tile title="Họ từ" id="family" action={<Count n={view.family.length + view.related.length} />}>
          <FamilyBlock family={view.family} related={view.related} />
        </Tile>
      ),
    },
    fullList && {
      key: 'senses', rows: 2 + sections.reduce((n, s) => n + 2 + Math.min(s.senses.length, SHOWN_SENSES) * 2, 0),
      node: (
        <Tile title={`Tất cả ${total} nghĩa`} id="senses">
          <SenseList senses={view.senses} lang={head.lang} examples={view.examplesBySense} resolved={view.resolved} glosses={view.glosses} />
        </Tile>
      ),
    },
    examples.length > 0 && {
      key: 'examples', rows: 2 + Math.min(examples.length, 3) * 2,
      node: (
        <div className="rounded-xl border border-black/10 p-4 empty:hidden">
          <ExampleList
            examples={examples}
            lang={head.lang}
            resolved={view.resolved}
            glosses={view.glosses}
            title={fullList && Object.keys(view.examplesBySense).length > 0 ? 'Ví dụ khác' : 'Ví dụ'}
          />
        </div>
      ),
    },
    view.grammarPoints.length > 0 && {
      key: 'grammar', rows: 1 + view.grammarPoints.length * 2,
      node: <GrammarLinks points={view.grammarPoints} rail />,
    },
  ] satisfies (TileSpec | false)[]).filter((t) => t !== false)
  const sides = balanceColumns(tiles.map((t) => t.rows))
  const columns = ([0, 1] as const).filter((side) => sides.includes(side))

  const jumps = [
    ...(fullList ? [{ href: '#senses', label: `Nghĩa · ${total}` }] : []),
    ...(view.phrases.length > 0 ? [{ href: '#phrases', label: `Cụm từ · ${view.phrases.length}` }] : []),
    ...(view.family.length + view.related.length > 0 ? [{ href: '#family', label: `Họ từ · ${view.family.length + view.related.length}` }] : []),
    ...(examples.length > 0 ? [{ href: '#examples', label: `Ví dụ · ${examples.length}` }] : []),
  ]

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div className={`flex min-w-0 flex-col gap-3 rounded-xl border border-black/10 p-5 ${SPAN[heroSpan]}`}>
        <LookupHero
          detail={head}
          hanViet={view.hanViet}
          summary={view.summary}
          jumps={jumps}
          posLabels={sections.filter((s) => s.key).map((s) => s.labelVi)}
        />
        {view.lemma && <LemmaLink lemma={view.lemma} preview={view.lemmaPreview ?? undefined} lang={head.lang} />}
      </div>

      {main.length > 0 && (
        <Tile
          title="Nghĩa chính"
          className={SPAN[mainSpan]}
          action={fullList ? <a href="#senses" className="text-xs font-medium text-blue-700 hover:underline">Tất cả {total}</a> : undefined}
        >
          <ol className="flex flex-col gap-3">
            {main.flatMap((g) => g.senses.map((s) => ({ s, pos: g.section.key ? g.section.labelVi : null }))).map(({ s, pos }, i) => (
              <li key={s.id ?? `${s.senseOrder}-${i}`} className="flex gap-3">
                <span aria-hidden="true" className="w-5 shrink-0 text-2xl font-bold leading-none tabular-nums text-black/15">{i + 1}</span>
                <div className="flex min-w-0 flex-col">
                  {pos && <span className="text-xs text-black/45">{pos.toLocaleLowerCase('vi')}</span>}
                  <span className="font-semibold text-black/90">
                    {s.glossVi ?? s.pivotVi ?? s.glossEn}
                    {!s.glossVi && s.pivotVi && (
                      <span className="ml-1 align-middle text-[10px] font-normal uppercase tracking-wide text-amber-700/70" title="Nghĩa suy ra qua tiếng Anh">qua tiếng Anh</span>
                    )}
                  </span>
                  {s.glossEn && (s.glossVi || s.pivotVi) && <span className="text-xs text-black/45">{s.glossEn}</span>}
                </div>
              </li>
            ))}
          </ol>
          {classifiers.length > 0 && (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-xs text-black/45">Lượng từ</span>
              {classifiers.map((c) => <span key={c} className="rounded-full bg-black/5 px-2.5 py-0.5 font-medium">{c}</span>)}
            </p>
          )}
        </Tile>
      )}

      {siblings && (
        <div className="min-w-0 lg:col-span-3">
          <CrossLanguagePanel siblings={view.siblings} />
        </div>
      )}

      {/* Wider than either column, so it takes a row of its own. */}
      {view.conjugation && (
        <div className="min-w-0 overflow-x-auto rounded-xl border border-black/10 p-4 lg:col-span-12">
          <ConjugationTable conjugation={view.conjugation} />
        </div>
      )}

      {columns.map((side) => (
        <div key={side} className={`flex min-w-0 flex-col gap-4 ${columns.length === 1 ? SPAN[12] : side === 0 ? SPAN[7] : SPAN[5]}`}>
          {tiles.map((t, i) => sides[i] === side && <div key={t.key} className="min-w-0 empty:hidden">{t.node}</div>)}
        </div>
      ))}
      {/* Out of the balancing: it renders nothing where the assistant is off, which would
          leave its column empty. */}
      <div className="min-w-0 lg:col-span-12">
        <AiCorner lang={head.lang} headword={head.headword} meaningVi={view.meaningVi} />
      </div>
    </div>
  )
}

function Count({ n }: { n: number }) {
  return <span className="text-xs tabular-nums text-black/40">{n}</span>
}
