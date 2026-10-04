import { useEffect, useState } from 'react'
import { Chip, FORMS_LABEL, FoldedList, LayerNote, LearnerHeader, LearnerRail, LemmaMention, PANEL, SenseBody, SenseChips, minorGloss, minorTerms } from './LearnerParts'
import { CARD, CONTAINER, SectionLabel } from './WordParts'
import { minorSenses, type LearnerLayer, type MinorSense } from '@/lib/dictionary/learner'
import { useAnchor } from '@/lib/hooks/useAnchor'
import type { WordView } from '@/lib/dictionary/wordView'

const MINOR_ID = 'minor-senses'
const senseId = (order: number) => `sense-${order}`

/**
 * "Trang đọc": every core sense in full, one after another, then the other senses as a
 * compact table. The contents beside it stay in view and mark the section on screen; the
 * panels under the contents scroll with the page, since together they outgrow a screen.
 */
export function ReadLayout({ view, layer }: { view: WordView; layer: LearnerLayer }) {
  const { other, inflections } = minorSenses(layer, view.senses)
  const minor = [...other, ...inflections]
  const anchor = useAnchor()
  const minorId = anchor(MINOR_ID)
  const ids = [...layer.senses.map((s) => anchor(senseId(s.order))), ...(minor.length > 0 ? [minorId] : [])]
  const watched = ids.join(' ')
  const minorLabel = [other.length > 0 && `${other.length} nghĩa khác`, inflections.length > 0 && `${inflections.length} dạng từ`]
    .filter(Boolean).join(' và ')
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const spy = new IntersectionObserver((entries) => {
      const first = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      if (first) setActive(first.target.id)
    }, { rootMargin: '-90px 0px -60% 0px' })
    for (const id of watched.split(' ')) {
      const el = document.getElementById(id)
      if (el) spy.observe(el)
    }
    return () => spy.disconnect()
  }, [watched])

  const tocLink = (id: string, n: string, label: string) => (
    <li key={id}>
      <a
        href={`#${id}`}
        aria-current={active === id ? 'location' : undefined}
        className={`grid grid-cols-[22px_minmax(0,1fr)] gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors duration-150 ease-std ${
          active === id ? 'bg-(--zs-chip) font-semibold text-(--zs-ink)' : 'text-(--zs-soft) hover:bg-(--tint-1) hover:text-(--zs-ink)'
        }`}
      >
        <span className="font-mono text-xs text-(--zs-soft)">{n}</span>
        <span className="truncate">{label}</span>
      </a>
    </li>
  )

  return (
    <div className="flex flex-col gap-6">
      <LearnerHeader view={view} layer={layer} />
      <div className={`${CONTAINER} grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,900px)_300px] lg:justify-between lg:gap-12`}>
        <div className="flex min-w-0 flex-col gap-10">
          {layer.senses.map((s) => (
            <section key={s.order} id={anchor(senseId(s.order))} data-reveal={Math.min(s.order - 1, 6)} className="grid scroll-mt-[calc(var(--header-h)+1.5rem)] grid-cols-[34px_minmax(0,1fr)] gap-x-2">
              <span aria-hidden="true" className="pt-1 font-mono text-[15px] font-semibold text-(--zs-soft)">{s.order}</span>
              <SenseBody sense={s} view={view} />
            </section>
          ))}
          {minor.length > 0 && (
            <section id={minorId} data-reveal="" className="flex scroll-mt-[calc(var(--header-h)+1.5rem)] flex-col gap-2.5">
              <SectionLabel>
                {other.length === 0 ? FORMS_LABEL : 'Nghĩa khác và dạng từ'} · {minor.length}
              </SectionLabel>
              {/* The subtitles only tell the two apart when both are there. */}
              <MinorTable label={inflections.length > 0 ? 'Nghĩa khác' : null} senses={other} noun="nghĩa khác" />
              <MinorTable label={other.length > 0 ? FORMS_LABEL : null} senses={inflections} noun="dạng từ" />
            </section>
          )}
          <LayerNote layer={layer} view={view} />
        </div>

        <aside className="flex min-w-0 flex-col gap-4 lg:self-stretch">
          {ids.length > 1 && (
            <nav aria-label="Trên trang này" className={`${PANEL} z-10 hidden lg:sticky lg:top-[calc(var(--header-h)+1rem)] lg:flex`}>
              <SectionLabel>Trên trang này</SectionLabel>
              <ul className="flex flex-col gap-0.5">
                {layer.senses.map((s) => tocLink(anchor(senseId(s.order)), String(s.order), s.viTerms[0] ?? ''))}
                {minor.length > 0 && tocLink(minorId, '+', minorLabel)}
              </ul>
            </nav>
          )}
          <LearnerRail view={view} layer={layer} />
        </aside>
      </div>
    </div>
  )
}

/** Rows of each table shown before expanding: take has 46 other senses. */
const MINOR_SHOWN = 6

function MinorTable({ label, senses, noun }: { label: string | null; senses: MinorSense[]; noun: string }) {
  if (senses.length === 0) return null
  return (
    <>
      {label && <SectionLabel as="h3" className="mt-2">{label} · {senses.length}</SectionLabel>}
      <FoldedList
        shown={MINOR_SHOWN}
        noun={noun}
        className={`${CARD} px-2 py-1`}
        rows={senses.map((m) => (
          <li key={m.senseId} className="grid gap-1.5 border-t border-(--zs-line) px-2.5 py-2.5 text-sm first:border-0 sm:grid-cols-[minmax(0,2fr)_10rem_minmax(0,3fr)] sm:items-baseline sm:gap-3">
            <span className="flex flex-col">
              <span className="font-semibold">{minorTerms(m)}</span>
              {m.isInflection && m.lemma && <span className="text-[13px] text-(--zs-soft)">dạng của <LemmaMention minor={m} /></span>}
            </span>
            <SenseChips pos={m.pos} domain={m.domain} register={m.register}>
              {m.isInflection && <Chip tone="form">dạng từ</Chip>}
            </SenseChips>
            <span className="line-clamp-3 text-[13px] text-(--zs-soft)" title={minorGloss(m) ?? undefined}>{minorGloss(m)}</span>
          </li>
        ))}
      />
    </>
  )
}
