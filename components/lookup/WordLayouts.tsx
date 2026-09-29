'use client'
import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { BilingualLayout } from './BilingualLayout'
import { ClassicLayout } from './ClassicLayout'
import { FeedbackButton } from './FeedbackButton'
import { GlanceLayout } from './GlanceLayout'
import { MapLayout } from './MapLayout'
import { OverviewLayout } from './OverviewLayout'
import { ReadLayout } from './ReadLayout'
import { CONTAINER } from './WordParts'
import { WORD_LAYOUTS, availableLayouts, resolveLayout, wordLayout, type WordLayout } from '@/lib/dictionary/wordLayout'
import { AnchorPrefix } from '@/lib/hooks/useAnchor'
import type { WordView } from '@/lib/dictionary/wordView'

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

/** `stored` is the choice this browser remembers, marked so the reader knows it sticks.
 *  Before hydration both are null and `app/globals.css` marks them from the boot script.
 *  Under 640px the six icons look alike, so a phone gets the names in a native select. */
function LayoutPicker({ value, stored, options }: {
  value: WordLayout | null
  stored: WordLayout | null
  options: ReturnType<typeof availableLayouts>
}) {
  return (
    <>
      <label className="flex items-center gap-2 text-sm sm:hidden">
        {/* Read out only: shown, it pushed "Góp ý" onto a second row at 375 px. */}
        <span className="sr-only">Bố cục</span>
        <select
          value={value ?? 'overview'}
          onChange={(e) => {
            const next = options.find((l) => l.key === e.target.value)
            if (next) wordLayout.set(next.key)
          }}
          className="rounded-lg border border-black/15 bg-white px-2.5 py-1.5 text-sm font-medium"
        >
          {options.map((l) => (
            <option key={l.key} value={l.key}>{l.key === stored ? `${l.label} (mặc định)` : l.label}</option>
          ))}
        </select>
      </label>
      <LayoutButtons value={value} stored={stored} options={options} />
    </>
  )
}

function LayoutButtons({ value, stored, options }: Parameters<typeof LayoutPicker>[0]) {
  return (
    <div role="group" aria-label="Bố cục" className="hidden flex-wrap rounded-lg bg-black/5 p-0.5 sm:flex">
      {options.map((l) => (
        <button
          key={l.key}
          type="button"
          data-pick={l.key}
          aria-pressed={value === l.key}
          onClick={() => wordLayout.set(l.key)}
          title={l.label}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium ${
            value === l.key ? 'bg-white text-black shadow-sm' : 'text-black/60 hover:text-black'
          }`}
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            {ICONS[l.key]}
          </svg>
          <span>{l.label}</span>
          {(stored === null || l.key === stored) && (
            <span aria-hidden="true" data-hint={stored === null || undefined} className="text-[10.5px] font-normal text-black/60">mặc định</span>
          )}
        </button>
      ))}
    </div>
  )
}

const NOTE = 'w-full text-[13px] text-black/60 sm:text-right'
/** What a hidden panel renders while hydrating: nothing React compares or patches. */
const DORMANT = { __html: '' }

/**
 * The word page in the layout the reader picked, with the picker above it. Each layout
 * sets its own width; the overview draws on a grey page.
 *
 * The page is cached for everyone, so the server cannot know the stored layout. It draws
 * every layout the entry offers, each in a panel, and `app/globals.css` shows the one the
 * boot script marked on <html> before the first paint. Hidden panels prefix their ids.
 * Hydration works on the shown panel only. Over server HTML (main[data-boot] is in the
 * document) every other panel is an empty `dangerouslySetInnerHTML`, which React hydrates
 * without rendering or touching its children; the render after hydration drops it, and
 * the shown one keeps its DOM. A Suspense boundary per panel would do the same, but React
 * then streams each large panel out of line and reveals the shown one up to 300 ms late.
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
  return (
    <main
      data-boot={hydrated ? undefined : ''}
      data-rendered-layout={layout}
      data-layouts={options.map((l) => l.key).join(' ')}
      className="flex w-full flex-col gap-5 pt-5 pb-16"
    >
      <div className={`${CONTAINER} flex flex-wrap items-center justify-between gap-x-3 gap-y-2`}>
        <Link href="/dictionary" className="text-sm text-black/60 hover:underline">← Dịch</Link>
        <div className="flex flex-wrap items-center gap-2">
          <LayoutPicker value={hydrated ? layout : null} stored={hydrated ? stored : null} options={options} />
          <FeedbackButton entryId={view.head.id} senses={view.senses} />
        </div>
        {hydrated ? layout !== stored && (
          <p className={NOTE}>Từ này chưa có bố cục {label(stored)}, đang hiện {label(layout)}.</p>
        ) : missing.map((l) => (
          <p key={l.key} data-note={l.key} className={NOTE}>Từ này chưa có bố cục {l.label}, đang hiện {label('classic')}.</p>
        ))}
      </div>
      {panels.map((key) => (shown !== null && key !== shown
        ? <div key={key} data-panel={key} suppressHydrationWarning dangerouslySetInnerHTML={DORMANT} />
        : (
          <div key={key} data-panel={key}>
            <AnchorPrefix value={hydrated || key === 'overview' ? '' : `${key}-`}>
              <LayoutBody layout={key} view={view} />
            </AnchorPrefix>
          </div>
        )))}
    </main>
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
