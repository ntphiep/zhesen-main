'use client'
import { useSyncExternalStore } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { OverviewLayout } from './OverviewLayout'
import { WORD_LAYOUTS, wordLayout, type WordLayout } from '@/lib/dictionary/wordLayout'
import type { WordView } from '@/lib/dictionary/wordView'

// The page is cached for everyone in the default layout, so only that one is rendered on
// the server; the other two load when a reader picks them.
const BilingualLayout = dynamic(() => import('./BilingualLayout').then((m) => m.BilingualLayout), {
  ssr: false, loading: () => <LayoutLoading />,
})
const ColumnsLayout = dynamic(() => import('./ColumnsLayout').then((m) => m.ColumnsLayout), {
  ssr: false, loading: () => <LayoutLoading />,
})

function LayoutLoading() {
  return <p role="status" className="py-10 text-center text-sm text-black/45">Đang đổi bố cục…</p>
}

const ICONS: Record<WordLayout, React.ReactNode> = {
  overview: <><rect x="2" y="2" width="7" height="7" rx="1.5" /><rect x="11" y="2" width="7" height="4" rx="1.5" /><rect x="11" y="8" width="7" height="10" rx="1.5" /><rect x="2" y="11" width="7" height="7" rx="1.5" /></>,
  bilingual: <><path d="M10 2v16" /><path d="M3 5h4M3 9h4M3 13h4M13 5h4M13 9h4M13 13h4" /></>,
  columns: <><rect x="2" y="3" width="3" height="14" rx="1" /><rect x="7" y="3" width="5" height="14" rx="1" /><rect x="14" y="3" width="4" height="14" rx="1" /></>,
}

function LayoutPicker({ value }: { value: WordLayout }) {
  return (
    <div role="group" aria-label="Bố cục" className="flex rounded-lg bg-black/5 p-0.5">
      {WORD_LAYOUTS.map((l) => (
        <button
          key={l.key}
          type="button"
          aria-pressed={value === l.key}
          onClick={() => wordLayout.set(l.key)}
          title={l.label}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium ${
            value === l.key ? 'bg-white text-black shadow-sm' : 'text-black/55 hover:text-black'
          }`}
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            {ICONS[l.key]}
          </svg>
          <span className="sr-only sm:not-sr-only">{l.label}</span>
        </button>
      ))}
    </div>
  )
}

/** The word page in the layout the reader picked, with the picker above it. */
export function WordLayouts({ view }: { view: WordView }) {
  const layout = useSyncExternalStore(wordLayout.subscribe, wordLayout.snapshot, wordLayout.serverSnapshot)
  return (
    <main
      data-rendered-layout={layout}
      className={`mx-auto flex w-full flex-col gap-5 px-4 py-8 sm:px-6 ${layout === 'columns' ? 'max-w-[1600px]' : 'max-w-[1248px]'}`}
    >
      <div className="flex items-center justify-between gap-3">
        <Link href="/dictionary" className="text-sm text-black/50 hover:underline">← Dịch</Link>
        <LayoutPicker value={layout} />
      </div>
      {layout === 'bilingual'
        ? <BilingualLayout view={view} />
        : layout === 'columns'
          ? <ColumnsLayout view={view} />
          : <OverviewLayout view={view} />}
    </main>
  )
}
