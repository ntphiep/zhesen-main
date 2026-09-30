import { useState } from 'react'
import {
  Chip, CollocationGloss, Equivalents, Examples, FORMS_LABEL, LayerNote, LearnerHeader, LearnerRail, Mention, PANEL, PhraseTable, SenseChips,
  SourceLine, minorGloss, minorTerms, toneOf,
} from './LearnerParts'
import { CARD, CONTAINER, PivotMark, SectionLabel } from './WordParts'
import { LINK_KIND_VI, domainLabel, minorSenses, registerLabel, type LearnerLayer, type LearnerLink, type MinorSense } from '@/lib/dictionary/learner'
import type { WordView } from '@/lib/dictionary/wordView'

function Badge({ order }: { order: number }) {
  return (
    <span data-tone={toneOf(order)} className="inline-grid h-5 min-w-5 place-items-center rounded-md bg-(--t) px-1 font-mono text-[11.5px] font-semibold text-(--t-ink)">
      {order}
    </span>
  )
}

/**
 * "Toàn cảnh": the senses, their collocations and their related words in three columns at
 * once. Each core sense has a colour; pointing at a sense or focusing it lights up
 * everything that belongs to it and dims the rest.
 */
export function GlanceLayout({ view, layer }: { view: WordView; layer: LearnerLayer }) {
  const [active, setActive] = useState<number | null>(null)
  const { other, inflections } = minorSenses(layer, view.senses)
  const lang = view.head.lang
  const derived = layer.source === 'dictionary'
  const dim = (order: number) => (active !== null && active !== order ? 'opacity-30' : '')
  const collocations = layer.senses.flatMap((s) => s.collocations.map((link) => ({ order: s.order, link })))
  const related = layer.senses.flatMap((s) => [...s.synonyms, ...s.antonyms].map((link) => ({ order: s.order, link })))
  const equivalents = layer.senses
    .map((s) => ({ order: s.order, links: s.equivalents.filter((e) => e.lang !== lang) }))
    .filter((e) => e.links.length > 0)

  const item = (order: number, key: string, body: React.ReactNode) => (
    <li key={key} className={`grid grid-cols-[22px_minmax(0,1fr)] items-baseline gap-x-2.5 transition-opacity duration-150 ease-std motion-reduce:transition-none ${dim(order)}`}>
      <Badge order={order} />
      <div className="min-w-0">{body}</div>
    </li>
  )
  const relatedBody = (link: LearnerLink) => (
    <>
      <Mention link={link} /> <span className="text-[13px] text-(--zs-soft)">{LINK_KIND_VI[link.kind]}</span>
      {link.noteVi && <span className="block text-[13.5px] text-(--zs-soft)">{link.noteVi}</span>}
    </>
  )

  return (
    <div className="flex flex-col gap-6">
      <LearnerHeader view={view} layer={layer} minor={other.length} forms={inflections.length} />
      <div className={`${CONTAINER} grid grid-cols-1 items-start gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.9fr)] xl:gap-5`}>
        <section data-reveal="0" className="flex min-w-0 flex-col gap-3">
          <SectionLabel className="px-1">Nghĩa</SectionLabel>
          {layer.senses.map((s) => (
            <article
              key={s.order}
              tabIndex={0}
              aria-label={`Nghĩa ${s.order}: ${s.viTerms.join(', ')}`}
              onMouseEnter={() => setActive(s.order)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(s.order)}
              onBlur={() => setActive(null)}
              data-tone={toneOf(s.order)}
              className={`${CARD} flex flex-col gap-2.5 border-l-[3px] border-l-(--t) p-4 transition-opacity duration-150 ease-std motion-reduce:transition-none sm:p-5 ${
                active === s.order ? 'ring-2 ring-(--t)' : dim(s.order)
              }`}
            >
              <SenseChips pos={s.pos} cefr={s.cefr} domain={s.domain} register={s.register}><Badge order={s.order} /></SenseChips>
              <h3 className="text-lg font-extrabold leading-tight">{s.viTerms.join(', ')}{s.pivot && <PivotMark />}</h3>
              {s.viDefinition && <p className="text-[15px] leading-relaxed">{s.viDefinition}</p>}
              {s.enDefinition && <p className="text-[13.5px] text-(--zs-soft)">{s.enDefinition}</p>}
              <Examples examples={s.examples.slice(0, 1)} view={view} />
              <SourceLine ids={s.sourceSenseIds} view={view} />
            </article>
          ))}
          <MinorPanel label="Nghĩa khác" senses={other} />
          <MinorPanel label={FORMS_LABEL} senses={inflections} />
        </section>

        {/* A derived layer has no collocations of its own, so the column lists the entry's phrases. */}
        <section data-reveal="1" className="flex min-w-0 flex-col gap-3">
          <SectionLabel className="px-1">
            {derived ? `Cụm từ · ${view.phrases.length}` : `Kết hợp hay gặp · ${collocations.length}`}
          </SectionLabel>
          <div className={PANEL}>
            {derived ? (
              view.phrases.length === 0 ? <p className="text-sm text-(--zs-soft)">Chưa có cụm từ.</p> : <PhraseTable view={view} />
            ) : collocations.length === 0 ? <p className="text-sm text-(--zs-soft)">Chưa có kết hợp.</p> : (
              <ul className="flex flex-col gap-3 text-sm">
                {collocations.map(({ order, link }) => item(order, `${order}-${link.text}`, (
                  <>
                    <Mention link={link} /> <span className="font-mono text-[11px] text-(--zs-soft)">{link.pattern}</span>
                    {link.reading && <span className="block text-xs text-(--zs-soft)">{link.reading}</span>}
                    <CollocationGloss link={link} view={view} />
                  </>
                )))}
              </ul>
            )}
          </div>
        </section>

        <section data-reveal="2" className="flex min-w-0 flex-col gap-3 lg:col-span-2 xl:col-span-1">
          <SectionLabel className="px-1">Từ liên quan</SectionLabel>
          {related.length > 0 && (
            <div className={PANEL}>
              <ul className="flex flex-col gap-3 text-sm">
                {related.map(({ order, link }) => item(order, `${order}-${link.kind}-${link.text}`, relatedBody(link)))}
              </ul>
            </div>
          )}
          {equivalents.length > 0 && (
            <div className={PANEL}>
              <SectionLabel>Ở ngôn ngữ khác</SectionLabel>
              <ul className="flex flex-col gap-2.5">
                {equivalents.map((e) => item(e.order, `eq-${e.order}`, <Equivalents links={e.links} />))}
              </ul>
            </div>
          )}
          <LearnerRail view={view} layer={layer} phrases={false} />
          <LayerNote layer={layer} view={view} />
        </section>
      </div>
    </div>
  )
}

function MinorPanel({ label, senses }: { label: string; senses: MinorSense[] }) {
  if (senses.length === 0) return null
  return (
    <div className={PANEL}>
      <SectionLabel>{label} · {senses.length}</SectionLabel>
      <ul className="flex flex-col gap-2 text-sm">
        {senses.map((m) => (
          <li key={m.senseId} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{minorTerms(m)}</span>
            {m.domain && <Chip tone="domain">{domainLabel(m.domain)}</Chip>}
            {m.register && <Chip tone="register">{registerLabel(m.register)}</Chip>}
            {m.isInflection && <Chip tone="form">{m.lemma ? `dạng của ${m.lemma}` : 'dạng từ'}</Chip>}
            {m.isInflection && m.glossEn && <span className="basis-full text-xs text-(--zs-soft)">{minorGloss(m)}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
