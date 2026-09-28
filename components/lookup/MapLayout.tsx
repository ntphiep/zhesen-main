import { useEffect, useRef, useState } from 'react'
import { Chip, FORMS_LABEL, LayerNote, LearnerHeader, LearnerRail, MinorBody, PANEL, SenseBody, minorGloss, minorTerms } from './LearnerParts'
import { CARD, CONTAINER, MoreButton, PosChip, SectionLabel } from './WordParts'
import { domainLabel, minorSenses, registerLabel, type LearnerLayer, type LearnerSense, type MinorSense } from '@/lib/dictionary/learner'
import type { WordView } from '@/lib/dictionary/wordView'

type Item = { kind: 'core'; sense: LearnerSense } | { kind: 'minor'; minor: MinorSense }

/** Other senses shown without a fold, so the list stays short enough to stick; take has 80. */
const MINOR_OPEN = 6

const ROW = 'grid w-full grid-cols-[22px_minmax(0,1fr)_auto] items-baseline gap-x-2 gap-y-1 rounded-[10px] px-2.5 py-2 text-left'

/**
 * "Bản đồ nghĩa": every sense in one list on the left, the chosen one in full beside it, the
 * word's usage and the words around it on the right. A click or ↑ and ↓ change the sense;
 * nothing is behind a tab.
 */
export function MapLayout({ view, layer }: { view: WordView; layer: LearnerLayer }) {
  const { other, inflections } = minorSenses(layer, view.senses)
  const items: Item[] = [
    ...layer.senses.map((sense) => ({ kind: 'core' as const, sense })),
    ...[...other, ...inflections].map((minor) => ({ kind: 'minor' as const, minor })),
  ]
  const core = layer.senses.length
  const minorCount = items.length - core
  const [index, setIndex] = useState(0)
  const [unfolded, setUnfolded] = useState(false)
  const foldable = minorCount > MINOR_OPEN
  const open = !foldable || unfolded
  const [said, setSaid] = useState('')
  const nav = useRef<HTMLElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const focusNext = useRef<number | null>(null)
  const folded = useRef(false)
  const at = Math.min(index, items.length - 1)
  const current = items[at]

  // A row the key just unfolded exists only after this render, so focus waits for it; so
  // does the shorter list a fold leaves, scrolled back into view with sense 1 beside it.
  useEffect(() => {
    if (focusNext.current !== null) buttons.current[focusNext.current]?.focus()
    focusNext.current = null
    if (folded.current && box.current && box.current.getBoundingClientRect().top < 0) box.current.scrollIntoView({ block: 'start' })
    folded.current = false
  })

  function go(next: number) {
    if (next >= core) setUnfolded(true)
    setIndex(next)
  }

  // The page itself, or a row of the list, takes the keys; any other control keeps its own.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      if (!(e.target === document.body || (e.target instanceof Node && nav.current?.contains(e.target)))) return
      const next = Math.max(0, Math.min(items.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))
      if (next === at) return
      e.preventDefault()
      go(next)
      focusNext.current = next
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  /** The two buttons under the sense keep focus, so the new sense's title is announced. */
  function step(next: number) {
    go(next)
    const item = items[next]
    setSaid(item.kind === 'core' ? item.sense.viTerms.join(', ') : minorTerms(item.minor))
  }

  function toggle() {
    if (unfolded && at >= core) setIndex(0)
    if (unfolded) folded.current = true
    setUnfolded(!unfolded)
  }

  const row = (item: Item, i: number) => (
    <li key={item.kind === 'core' ? `c${item.sense.order}` : item.minor.senseId}>
      <button
        type="button"
        ref={(el) => { buttons.current[i] = el }}
        aria-current={i === at}
        onClick={() => setIndex(i)}
        className={`${ROW} ${i === at ? 'bg-blue-50' : 'hover:bg-black/[0.04]'}`}
      >
        {item.kind === 'core' ? (
          <>
            <span className="font-mono text-xs text-black/60">{item.sense.order}</span>
            <span className={`text-[14.5px] font-semibold leading-snug ${i === at ? 'text-blue-700' : ''}`}>{item.sense.viTerms.join(', ')}</span>
            <span className="font-mono text-[11px] text-black/60">{item.sense.cefr}</span>
            <span className="col-start-2 col-end-4 flex flex-wrap gap-1">
              <PosChip value={item.sense.pos} />
              {item.sense.domain && <Chip tone="domain">{domainLabel(item.sense.domain)}</Chip>}
            </span>
          </>
        ) : (
          <>
            <span aria-hidden="true" className="font-mono text-xs text-black/60">·</span>
            <span className={`text-[13.5px] font-medium leading-snug ${i === at ? 'text-blue-700' : 'text-black/70'}`}>{minorTerms(item.minor)}</span>
            <span />
            <span className="col-start-2 col-end-4 flex flex-wrap gap-1">
              {item.minor.domain && <Chip tone="domain">{domainLabel(item.minor.domain)}</Chip>}
              {item.minor.register && <Chip tone="register">{registerLabel(item.minor.register)}</Chip>}
              {item.minor.isInflection && <Chip tone="form">{item.minor.lemma ? `dạng của ${item.minor.lemma}` : 'dạng từ'}</Chip>}
            </span>
            {item.minor.isInflection && item.minor.glossEn && (
              <span className="col-start-2 col-end-4 text-xs text-black/60">{minorGloss(item.minor)}</span>
            )}
          </>
        )}
      </button>
    </li>
  )

  const group = (label: string, from: number, count: number) => count > 0 && (
    <>
      <li className="flex items-baseline justify-between px-2.5 pb-1 pt-3 first:pt-1">
        <SectionLabel>{label}</SectionLabel>
        <span className="text-xs text-black/60">{count}</span>
      </li>
      {items.slice(from, from + count).map((item, j) => row(item, from + j))}
    </>
  )

  return (
    <div className="flex flex-col gap-6">
      <LearnerHeader view={view} layer={layer} minor={other.length} forms={inflections.length} />
      <div ref={box} className={`${CONTAINER} grid scroll-mt-[calc(var(--header-h)+1rem)] grid-cols-1 items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[330px_minmax(0,1fr)_300px] xl:gap-6`}>
        {/* No inner scroll: the main senses always show whole. A long list of the others
            unfolds below them, and the unfolded list scrolls with the page. */}
        <nav
          ref={nav}
          aria-label="Các nghĩa"
          className={`${CARD} p-2 ${foldable && open ? '' : 'lg:sticky lg:top-[calc(var(--header-h)+1rem)]'}`}
        >
          <ul className="flex flex-col gap-0.5">
            {group('Nghĩa chính', 0, core)}
            {open && group('Nghĩa khác', core, other.length)}
            {open && group(FORMS_LABEL, core + other.length, inflections.length)}
          </ul>
          {foldable && (
            <MoreButton
              expanded={open}
              label={`Xem ${[other.length > 0 && `${other.length} nghĩa khác`, inflections.length > 0 && `${inflections.length} dạng từ`].filter(Boolean).join(' và ')}`}
              onClick={toggle}
              className="mx-2.5 mb-1.5 mt-2"
            />
          )}
        </nav>

        {/* A row deep in the unfolded list opens a short sense, which stays beside the row. */}
        <article className={`${CARD} flex min-h-[340px] min-w-0 flex-col gap-6 p-5 sm:px-8 sm:py-7 ${current?.kind === 'minor' ? 'lg:sticky lg:top-[calc(var(--header-h)+1rem)]' : ''}`}>
          {current?.kind === 'core'
            ? <SenseBody sense={current.sense} view={view} size="lg" />
            : current && <MinorBody minor={current.minor} view={view} />}
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-black/10 pt-4 text-[13.5px]">
            <button type="button" disabled={at === 0} onClick={() => step(at - 1)} className="rounded-lg px-2.5 py-1.5 text-black/65 hover:bg-black/[0.05] hover:text-black disabled:opacity-35 disabled:hover:bg-transparent">
              ← Nghĩa trước
            </button>
            <span className="hidden text-xs text-black/60 sm:inline">
              <kbd className="rounded border border-black/10 px-1 font-mono">↑</kbd> <kbd className="rounded border border-black/10 px-1 font-mono">↓</kbd> để chuyển nghĩa
            </span>
            <button type="button" disabled={at >= items.length - 1} onClick={() => step(at + 1)} className="rounded-lg px-2.5 py-1.5 text-black/65 hover:bg-black/[0.05] hover:text-black disabled:opacity-35 disabled:hover:bg-transparent">
              Nghĩa sau →
            </button>
          </div>
          <p aria-live="polite" className="sr-only">{said}</p>
        </article>

        <aside className="flex min-w-0 flex-col gap-4 lg:col-span-2 xl:sticky xl:top-[calc(var(--header-h)+1rem)] xl:col-span-1">
          <LearnerRail view={view} layer={layer} />
          <div className={PANEL}><LayerNote layer={layer} view={view} /></div>
        </aside>
      </div>
    </div>
  )
}
