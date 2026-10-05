'use client'
import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { LookupPanel } from './LookupPanel'
import { LANG_LABELS } from '@/lib/dictionary/labels'
import { lookupLayout, type LookupMode } from '@/lib/dictionary/lookupLayout'
import type { LangCode } from '@/lib/languages'

/**
 * The lookup, both directions. One box per direction because nothing in a Vietnamese word
 * separates it from an English or Spanish one, so guessing was wrong often enough that
 * "cá" answered with ca, can and called.
 *
 * `lang` scopes both boxes to one language, which is what the per-language hub wants: the
 * language selector disappears, because the caller already decided.
 */

const MODES = [
  { key: 'vi', label: 'Tiếng Việt' },
  { key: 'both', label: '2 chiều' },
  { key: 'fw', label: 'Ngoại ngữ' },
] as const

/** The two panels, as opposed to `LookupMode`, which also carries "show both". */
type PanelKey = Exclude<LookupMode, 'both'>

/** Animates the swap where the browser supports it. `flushSync` is required: the callback
 *  has to have produced the new DOM by the time it returns, and React would otherwise
 *  batch the update until after the snapshot was taken. */
function withTransition(run: () => void): void {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
  if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    run()
    return
  }
  doc.startViewTransition(() => flushSync(run))
}

export function LookupPair({ lang, initialQuery = '', initialDir = 'fw', autoFocus = false }: {
  lang?: LangCode
  initialQuery?: string
  /** Which box `initialQuery` was typed in, from `?dir=` (LookupPanel mirrors both). */
  initialDir?: 'vi' | 'fw'
  autoFocus?: boolean
}) {
  const { mode, swapped } = useSyncExternalStore(
    lookupLayout.subscribe, lookupLayout.snapshot, lookupLayout.serverSnapshot,
  )

  function chooseMode(next: LookupMode) {
    withTransition(() => lookupLayout.set({ mode: next, swapped }))
  }

  function swap() {
    withTransition(() => lookupLayout.set({ mode, swapped: !swapped }))
  }

  const other = lang ? LANG_LABELS[lang] : 'Anh, Trung, Tây Ban Nha'
  const both = mode === 'both'

  const panels = {
    vi: (
      <LookupPanel
        direction="vi"
        lang={lang}
        label={`Tiếng Việt sang ${other}`}
        initialQuery={initialDir === 'vi' ? initialQuery : ''}
        autoFocus={autoFocus && (initialDir === 'vi' || !initialQuery)}
      />
    ),
    fw: (
      <LookupPanel
        direction="fw"
        lang={lang}
        label={`${other} sang tiếng Việt`}
        initialQuery={initialDir === 'vi' ? '' : initialQuery}
        autoFocus={autoFocus && initialDir !== 'vi' && !!initialQuery}
      />
    ),
  }

  const order: PanelKey[] = mode === 'both' ? (swapped ? ['fw', 'vi'] : ['vi', 'fw']) : [mode]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <fieldset className="flex items-center gap-2 border-0 p-0">
          <legend className="sr-only">Dịch từ ngôn ngữ nào</legend>
          <span aria-hidden className="text-xs font-semibold text-(--zs-soft) sm:text-sm">Dịch từ:</span>
          {/* The segmented look of LayoutPicker, as on the signed-in home. */}
          <div className="inline-flex rounded-lg bg-(--zs-chip) p-0.5">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                aria-pressed={mode === m.key}
                onClick={() => chooseMode(m.key)}
                className={`rounded-md px-2.5 py-1 text-[0.8125rem] font-medium sm:px-3 sm:text-sm transition-colors duration-150 ease-std ${
                  mode === m.key ? 'bg-(--zs-btn) text-(--zs-btn-ink) shadow-sm' : 'text-(--zs-soft) hover:text-(--zs-ink)'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </fieldset>
        <button
          type="button"
          onClick={swap}
          disabled={!both}
          aria-label="Đổi chỗ hai ô"
          className="rounded-lg border-[1.5px] border-(--edge) bg-(--zs-bg) px-2.5 py-1.5 text-(--zs-ink) transition-colors duration-150 ease-std hover:border-sea-400 hover:bg-(--tint-1) disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-(--edge) disabled:hover:bg-(--zs-bg)"
        >
          <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7h13M13 4l3 3-3 3" />
            <path d="M17 13H4m3 3-3-3 3-3" />
          </svg>
        </button>
      </div>

      <div className={both ? 'grid gap-8 lg:grid-cols-2' : 'grid gap-8'}>
        {order.map((key, i) => (
          <div
            key={key}
            // A stable name per direction is what lets the browser tween the two boxes
            // past each other rather than redraw them in place.
            style={{ viewTransitionName: `lookup-${key}` }}
            className={both && i === 1 ? 'lg:border-l-[1.5px] lg:border-(--zs-line) lg:pl-8' : undefined}
          >
            {panels[key]}
          </div>
        ))}
      </div>
    </div>
  )
}
