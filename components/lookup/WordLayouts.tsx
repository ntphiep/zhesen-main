'use client'
import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { BilingualLayout } from './BilingualLayout'
import { ClassicLayout } from './ClassicLayout'
import { FeedbackButton } from './FeedbackButton'
import { GlanceLayout } from './GlanceLayout'
import { MapLayout } from './MapLayout'
import { OverviewLayout } from './OverviewLayout'
import { ReadLayout } from './ReadLayout'
import { CONTAINER } from './WordParts'
import { LayoutPicker } from '@/components/ui/LayoutPicker'
import { WORD_LAYOUTS, availableLayouts, resolveLayout, wordLayout, type WordLayout } from '@/lib/dictionary/wordLayout'
import { AnchorPrefix, useAnchor } from '@/lib/hooks/useAnchor'
import { entryPath } from '@/lib/dictionary/entryId'
import type { WordView } from '@/lib/dictionary/wordView'
import w from './Word.module.css'

const noop = () => () => {}
/** False on the server and through hydration, true from the first render after it. */
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false)

const ICONS: Record<WordLayout, React.ReactNode> = {
  overview: <><rect x="2" y="2" width="7" height="7" rx="1.5" /><rect x="11" y="2" width="7" height="4" rx="1.5" /><rect x="11" y="8" width="7" height="10" rx="1.5" /><rect x="2" y="11" width="7" height="7" rx="1.5" /></>,
  bilingual: <><path d="M10 2v16" /><path d="M3 5h4M3 9h4M3 13h4M13 5h4M13 9h4M13 13h4" /></>,
  classic: <><path d="M2 4h9M2 8h9M2 12h9M2 16h6" /><rect x="14" y="3" width="4" height="14" rx="1" /></>,
  map: <><rect x="2" y="3" width="5" height="14" rx="1.5" /><rect x="9" y="3" width="9" height="14" rx="1.5" /></>,
  read: <><path d="M3 5h9M3 9h9M3 13h6" /><rect x="14" y="4" width="3.5" height="12" rx="1" /></>,
  glance: <><rect x="2" y="3" width="4.5" height="14" rx="1.2" /><rect x="7.8" y="3" width="4.5" height="14" rx="1.2" /><rect x="13.6" y="3" width="4.5" height="14" rx="1.2" /></>,
}

const NOTE = 'w-full text-[13px] text-(--zs-soft) sm:text-right'
/** What a hidden panel renders while hydrating: nothing React compares or patches. */
const DORMANT = { __html: '' }

/**
 * The word page in the layout the reader picked, with the picker above it. Each layout
 * sets its own width; the overview draws on a pastel page.
 *
 * The page is cached for everyone, so the server cannot know the stored layout. It writes
 * a panel per layout the entry offers but draws only the overview in full: all six drawn
 * made take 1,159,896 bytes of HTML with six h1. The others hold a `PanelShell`.
 * `app/globals.css` shows the panel the boot script marked on <html> before the first
 * paint. Over server HTML (main[data-boot] is in the document) every panel but a shown
 * overview hydrates as an empty `dangerouslySetInnerHTML`, which React hydrates without
 * touching its children; the render after hydration drops the rest and draws the stored
 * layout into its own panel element, clearing the shell.
 */
export function WordLayouts({ view }: { view: WordView }) {
  const stored = useSyncExternalStore(wordLayout.subscribe, wordLayout.snapshot, wordLayout.serverSnapshot)
  const hydrated = useHydrated()
  const ctx = { learner: view.learner !== null }
  const layout = resolveLayout(stored, ctx)
  const options = availableLayouts(ctx)
  const label = (key: WordLayout) => WORD_LAYOUTS.find((l) => l.key === key)?.label ?? key
  const panels = hydrated ? [layout] : options.map((l) => l.key)
  const overServerHtml = !hydrated && typeof document !== 'undefined' && document.querySelector('main[data-boot]') !== null
  const shown = overServerHtml ? resolveLayout(wordLayout.snapshot(), ctx) : null
  const missing = WORD_LAYOUTS.filter((l) => !options.includes(l))
  // Only a layout picked here fades in: the one the page arrived in is already painted.
  const [picked, setPicked] = useState(false)
  const pick = (key: WordLayout) => {
    if (key !== layout) setPicked(true)
    wordLayout.set(key)
  }
  return (
    <main
      data-boot={hydrated ? undefined : ''}
      data-rendered-layout={layout}
      data-layouts={options.map((l) => l.key).join(' ')}
      data-l={view.head.lang}
      className={`${w.word} flex w-full flex-col gap-5 pt-5 pb-16 font-ui`}
    >
      <div className={`${CONTAINER} flex flex-wrap items-center justify-between gap-x-3 gap-y-2`}>
        <Link href="/dictionary" prefetch={false} className="text-sm font-semibold text-(--zs-soft) transition-colors duration-150 ease-std hover:text-(--zs-ink) hover:underline">← Dịch</Link>
        <div className="flex flex-wrap items-center gap-2">
          <LayoutPicker
            value={hydrated ? layout : null}
            stored={hydrated ? stored : null}
            options={options}
            icons={ICONS}
            fallback="overview"
            onPick={pick}
          />
          <FeedbackButton entryId={view.head.id} senses={view.senses} />
        </div>
        {hydrated ? layout !== stored && (
          <p className={NOTE}>Từ này chưa có bố cục {label(stored)}, đang hiện {label(layout)}.</p>
        ) : missing.map((l) => (
          <p key={l.key} data-note={l.key} className={NOTE}>Từ này chưa có bố cục {l.label}, đang hiện {label('classic')}.</p>
        ))}
      </div>
      {view.formOf && (
        <div className={CONTAINER}>
          <p className="rounded-[14px] bg-(--tint-2) px-4 py-3 text-[15px] leading-snug">
            <b data-hw="" lang={view.head.lang} className="font-semibold">{view.formOf.headword}</b> là {view.formOf.note}{' '}
            <Link href={entryPath(view.head.id)} prefetch={false} className="font-semibold text-(--zs-pen) hover:underline">{view.head.headword}</Link>
          </p>
        </div>
      )}
      {panels.map((key) => (shown !== null && (key !== 'overview' || shown !== 'overview')
        ? <div key={key} data-panel={key} suppressHydrationWarning dangerouslySetInnerHTML={DORMANT} />
        : (
          <div key={key} data-panel={key} data-enter={picked || undefined}>
            <AnchorPrefix value={hydrated || key === 'overview' ? '' : `${key}-`}>
              {hydrated || key === 'overview' ? <LayoutBody layout={key} view={view} /> : <PanelShell view={view} />}
            </AnchorPrefix>
          </div>
        )))}
    </main>
  )
}

/** What a panel other than the overview holds in the server HTML: the core senses, shown
 *  to a reader who stored that layout until the render after hydration draws it. */
function PanelShell({ view }: { view: WordView }) {
  const anchor = useAnchor()
  const senses = view.learner?.senses ?? []
  if (senses.length === 0) return null
  return (
    <nav aria-label="Các nghĩa chính" className={CONTAINER}>
      <ol className="flex flex-col gap-1 text-[15px]">
        {senses.map((s) => (
          <li key={s.order}>
            <a href={`#${anchor(`sense-${s.order}`)}`} className="text-(--zs-ink) hover:underline">
              <span className="mr-2 font-mono text-sm text-(--zs-soft)">{s.order}</span>{s.viTerms[0] ?? ''}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

function LayoutBody({ layout, view }: { layout: WordLayout; view: WordView }) {
  const layer = view.learner
  switch (layout) {
    case 'bilingual': return <BilingualLayout view={view} />
    case 'classic': return <ClassicLayout view={view} />
    case 'map': return layer ? <MapLayout view={view} layer={layer} /> : <ClassicLayout view={view} />
    case 'read': return layer ? <ReadLayout view={view} layer={layer} /> : <ClassicLayout view={view} />
    case 'glance': return layer ? <GlanceLayout view={view} layer={layer} /> : <ClassicLayout view={view} />
    default: return <OverviewLayout view={view} />
  }
}
