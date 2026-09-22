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

export function LookupPair({ lang, initialQuery = '', autoFocus = false }: {
  lang?: LangCode
  initialQuery?: string
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
        autoFocus={autoFocus && !initialQuery}
      />
    ),
    fw: (
      <LookupPanel
        direction="fw"
        lang={lang}
        label={`${other} sang tiếng Việt`}
        initialQuery={initialQuery}
        autoFocus={autoFocus && !!initialQuery}
      />
    ),
  }

  const order: PanelKey[] = mode === 'both' ? (swapped ? ['fw', 'vi'] : ['vi', 'fw']) : [mode]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <fieldset className="flex items-center gap-2 border-0 p-0">
          <legend className="sr-only">Dịch từ ngôn ngữ nào</legend>
          <span aria-hidden className="text-xs text-black/50">Dịch từ:</span>
          <div className="inline-flex overflow-hidden rounded-lg border border-black/15">
            {MODES.map((m, i) => (
              <button
                key={m.key}
                type="button"
                aria-pressed={mode === m.key}
                onClick={() => chooseMode(m.key)}
                className={`px-3 py-1.5 text-xs transition-colors ${i > 0 ? 'border-l border-black/15' : ''} ${
                  mode === m.key ? 'bg-black font-medium text-white' : 'text-black/55 hover:bg-black/5'
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
          className="rounded-lg border border-black/15 px-2.5 py-1.5 text-black/60 transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-35"
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
            className={both && i === 1 ? 'lg:border-l lg:border-black/10 lg:pl-8' : undefined}
          >
            {panels[key]}
          </div>
        ))}
      </div>
    </div>
  )
}
