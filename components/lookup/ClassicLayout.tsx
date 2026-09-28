import { Pronunciation } from './Pronunciation'
import { AddToWordlistButton } from './AddToWordlistButton'
import { CharacterPanel } from './CharacterPanel'
import { ConjugationTable } from './ConjugationTable'
import { CrossLanguagePanel } from './CrossLanguagePanel'
import { LemmaLink } from './LemmaLink'
import { Backlinks } from './LearnerParts'
import { SenseList } from './SenseList'
import { useAnchor } from '@/lib/hooks/useAnchor'
import {
  AiCorner, Badge, CONTAINER, ChipRow, ExampleRows, FormCells, GlossChips, GrammarList, LevelChip, SectionLabel, WordTable,
  baseFormLabel, frequencyBars,
} from './WordParts'
import { senseSections } from '@/lib/dictionary/wordPage'
import { cleanExamples, headwordForms, type WordView } from '@/lib/dictionary/wordView'

const RAIL_CARD = 'rounded-[10px] border border-black/10 p-4'

/**
 * A dictionary page in the usual order: the word and its forms, every meaning with its
 * example and synonyms, then the phrases and derived words as tables. A narrow rail keeps
 * the contents, the other languages and the grammar in view.
 */
export function ClassicLayout({ view }: { view: WordView }) {
  const { head } = view
  const lang = head.lang
  const sections = senseSections(view.senses)
  const examples = cleanExamples(view.examples, view.resolved, lang)
  const mark = headwordForms(view)
  const irregular = view.forms.some((f) => f.irregular)
  const baseLabel = baseFormLabel(head.pos)
  const pinyin = typeof head.attributes.pinyin === 'string' ? head.attributes.pinyin : null
  const showPinyin = pinyin !== null && !head.pronunciations.some((p) => p.ipa?.trim())

  const anchor = useAnchor()
  const parts = [
    ...sections.map((s) => ({ href: `#${s.anchor}`, label: s.labelVi, count: s.senses.length })),
    view.phrases.length > 0 && { href: '#phrases', label: 'Cụm từ', count: view.phrases.length },
    view.family.length + view.related.length > 0 && { href: '#family', label: 'Họ từ', count: view.family.length + view.related.length },
    view.antonyms.length > 0 && { href: '#antonyms', label: 'Trái nghĩa', count: view.antonyms.length },
    view.synonyms.length > 0 && { href: '#synonyms', label: view.senseSynonyms.length > 0 ? 'Đồng nghĩa khác' : 'Đồng nghĩa', count: view.synonyms.length },
    examples.length > 0 && { href: '#examples', label: 'Ví dụ khác', count: examples.length },
  ].filter((p) => p !== false).map((p) => ({ ...p, href: `#${anchor(p.href.slice(1))}` }))

  return (
    <div className={`${CONTAINER} grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12 xl:grid-cols-[minmax(0,1fr)_380px]`}>
      <div className="flex min-w-0 flex-col gap-10">
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="break-words text-[40px] font-bold leading-none tracking-[-0.03em] sm:text-[52px]">{head.headword}</h1>
            {head.traditional && head.traditional !== head.headword && <span className="text-3xl text-black/55">{head.traditional}</span>}
            <LevelChip level={head.level} />
            {frequencyBars(head.frequencyRank) > 0 && (
              <span title="Nằm trong 3000 từ thông dụng nhất của ngôn ngữ này"><Badge tone="emerald">Hay gặp</Badge></span>
            )}
            <div className="ml-auto">
              <AddToWordlistButton size="lg" entry={{ ...head, pronunciations: [] }} />
            </div>
          </div>
          {(showPinyin || view.hanViet) && (
            <div className="flex flex-wrap items-center gap-3 text-black/60">
              {showPinyin && <span className="font-medium">{pinyin}</span>}
              {view.hanViet && <span className="italic">Hán-Việt: {view.hanViet}</span>}
            </div>
          )}
          <Pronunciation headword={head.headword} prons={head.pronunciations} lang={lang} />
          {view.summary && <p className="text-lg leading-snug sm:text-[19px]">{view.summary}</p>}
          {view.lemma && <LemmaLink lemma={view.lemma} preview={view.lemmaPreview ?? undefined} lang={lang} />}
          {view.forms.length > 0 && (
            <section id={anchor('forms')} className="mt-3 flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <h2 className="text-[15px] font-bold">Dạng từ</h2>
                {irregular && <Badge>{baseLabel === 'Nguyên thể' ? 'Động từ bất quy tắc' : 'Bất quy tắc'}</Badge>}
              </div>
              <FormCells headword={head.headword} baseLabel={baseLabel} forms={view.forms} lang={lang} variant="compact" />
            </section>
          )}
        </header>

        {parts.length > 1 && (
          <nav aria-label="Mục trong trang" className="-mt-4 flex flex-wrap gap-2">
            {parts.map((p) => (
              <a key={p.href} href={p.href} className="rounded-full border border-black/10 px-3 py-1.5 text-[13px] font-semibold hover:bg-black/[0.04]">
                {p.label}{p.count > 0 && <span className="font-normal text-black/55"> · {p.count}</span>}
              </a>
            ))}
          </nav>
        )}

        {view.conjugation && (
          <Section id="conjugation" title="Chia động từ"><ConjugationTable conjugation={view.conjugation} /></Section>
        )}
        {lang === 'zh' && view.characters.length > 0 && (
          <Section id="characters" title="Chữ và bộ thủ"><CharacterPanel characters={view.characters} /></Section>
        )}

        <SenseList
          senses={view.senses} lang={lang} examples={view.examplesBySense} resolved={view.resolved} glosses={view.glosses}
          senseSynonyms={view.senseSynonyms} mark={mark}
        />

        {view.phrases.length > 0 && (
          <Section id="phrases" title="Cụm từ" note={`${view.phrases.length} cụm từ`}>
            <WordTable words={view.phrases} head="Cụm từ" />
          </Section>
        )}
        {view.family.length + view.related.length > 0 && (
          <Section id="family" title="Họ từ">
            <WordTable words={view.family} head="Từ" family level />
            {view.related.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-xs text-black/55">Cùng gốc</span>
                <ChipRow words={view.related} />
              </div>
            )}
          </Section>
        )}
        {view.antonyms.length > 0 && (
          <Section id="antonyms" title="Trái nghĩa"><GlossChips words={view.antonyms} tone="rose" /></Section>
        )}
        {view.synonyms.length > 0 && (
          <Section id="synonyms" title={view.senseSynonyms.length > 0 ? 'Đồng nghĩa khác' : 'Đồng nghĩa'}>
            <GlossChips words={view.synonyms} />
          </Section>
        )}
        {examples.length > 0 && (
          <Section id="examples" title="Ví dụ khác">
            <ExampleRows examples={examples} lang={lang} resolved={view.resolved} glosses={view.glosses} mark={mark} variant="quote" />
          </Section>
        )}
      </div>

      <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:max-h-[calc(100dvh-var(--header-h)-3rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain">
        {parts.length > 1 && (
          <nav aria-label="Trên trang này" className={`hidden flex-col gap-2.5 lg:flex ${RAIL_CARD}`}>
            <SectionLabel>Trên trang này</SectionLabel>
            <ul className="flex flex-col gap-1.5 text-sm">
              {parts.map((p) => (
                <li key={p.href}><a href={p.href} className="text-blue-700 hover:underline">{p.label}</a></li>
              ))}
            </ul>
          </nav>
        )}
        <CrossLanguagePanel siblings={view.siblings} className={RAIL_CARD} />
        {view.grammarPoints.length > 0 && (
          <section className={`flex flex-col gap-3 ${RAIL_CARD}`}>
            <SectionLabel>Ngữ pháp</SectionLabel>
            <GrammarList points={view.grammarPoints} />
          </section>
        )}
        <Backlinks view={view} className={`flex flex-col gap-3 ${RAIL_CARD}`} />
        <AiCorner lang={lang} headword={head.headword} meaningVi={view.meaningVi} className="rounded-[10px] bg-black/[0.04] p-4" />
      </aside>
    </div>
  )
}

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: React.ReactNode }) {
  const anchor = useAnchor()
  return (
    <section id={anchor(id)} className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2.5">
        <h2 className="text-lg font-bold">{title}</h2>
        {note && <span className="text-[13px] text-black/55">{note}</span>}
      </div>
      {children}
    </section>
  )
}
