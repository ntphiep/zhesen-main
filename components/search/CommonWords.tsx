'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LinkPending } from '@/components/ui/LinkPending'
import { entryPath } from '@/lib/dictionary/entryId'
import { LANG_LABELS } from '@/lib/dictionary/labels'
import { LANG_CODES, type LangCode } from '@/lib/languages'
import { useReducedMotion } from '@/lib/hooks/useReducedMotion'
import s from './Lookup.module.css'

/** The three fields a chip draws. The full `DictEntryPreview` would cross the server to
 *  client boundary for nothing. */
export interface WordChip {
  id: string
  headword: string
  glossVi: string | null
}

/** Enough to show what a language looks like without wrapping to a third line at 1440px. */
const PER_PAGE = 10

const ROTATE_MS = 5000

const PAUSE = <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3 fill-current"><rect x="3.5" y="3" width="3" height="10" rx="1" /><rect x="9.5" y="3" width="3" height="10" rx="1" /></svg>
const PLAY = <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3 fill-current"><path d="M5 3.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L5.9 2.7a.6.6 0 0 0-.9.5z" /></svg>

/** The slice starting at `from`, wrapping round the end, so a short pool still fills the
 *  row instead of leaving a ragged last page. */
function page(pool: readonly WordChip[], from: number): WordChip[] {
  if (pool.length === 0) return []
  return Array.from({ length: Math.min(PER_PAGE, pool.length) }, (_, i) => pool[(from + i) % pool.length])
}

/**
 * The common words under the boxes, cycling so the strip shows the whole pool over time
 * rather than the same ten words on every visit.
 *
 * Rotation stops while the pointer or the keyboard is inside the strip, stays stopped
 * after the pause button, and never starts when the reader asked for reduced motion:
 * moving content that cannot be paused is WCAG 2.2.2.
 */
export function CommonWords({ pools }: { pools: Record<LangCode, WordChip[]> }) {
  const [from, setFrom] = useState(0)
  const [held, setHeld] = useState(false)
  // Stopped by the button, which outlasts the pointer leaving the strip.
  const [stopped, setStopped] = useState(false)
  // The chip pointed at, whose entry page is prefetched ahead of the click.
  const [intent, setIntent] = useState<string | null>(null)
  const reduced = useReducedMotion()

  const longest = Math.max(...LANG_CODES.map((l) => pools[l].length))

  useEffect(() => {
    if (held || stopped || reduced || longest <= PER_PAGE) return
    const timer = setInterval(() => setFrom((f) => (f + PER_PAGE) % longest), ROTATE_MS)
    return () => clearInterval(timer)
  }, [held, stopped, reduced, longest])

  return (
    <div
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
    >
      <div className="flex items-center gap-2">
        <h2 className="text-xs font-bold tracking-[0.02em] text-(--zs-soft)">Từ thông dụng</h2>
        {/* Kept in the layout under reduced motion, hidden and inert, so the row does not
            shift when the setting is read after hydration. */}
        {longest > PER_PAGE && (
          <button
            type="button"
            aria-pressed={stopped}
            aria-label="Dừng đổi từ"
            aria-hidden={reduced || undefined}
            disabled={reduced}
            onClick={() => setStopped((v) => !v)}
            className={`grid size-7 place-items-center rounded-full border-[1.5px] border-(--edge) bg-(--zs-bg) text-(--zs-ink) transition-colors duration-150 ease-std hover:border-sea-400 ${reduced ? 'invisible' : ''}`}
          >
            {stopped ? PLAY : PAUSE}
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {LANG_CODES.map((l) => (
          <div key={l} className="flex flex-wrap items-baseline gap-x-2 gap-y-1.5">
            <span className="w-full shrink-0 text-xs sm:w-32 font-semibold whitespace-nowrap text-(--zs-soft)">{LANG_LABELS[l]}</span>
            {page(pools[l], from).map((e) => (
              <Link
                // The index is part of the key so React replaces the chip rather than
                // renaming it in place, which is what restarts the fade.
                key={`${from}-${e.id}`}
                href={entryPath(e.id)}
                // Prefetched on intent, like the lookup results: forty chips in view would
                // each prefetch an entry page to open one.
                prefetch={intent === e.id ? null : false}
                onMouseEnter={() => setIntent(e.id)}
                onFocus={() => setIntent(e.id)}
                onTouchStart={() => setIntent(e.id)}
                className={`chip-rotate ${s.chip} px-3 py-1 text-base`}
                title={e.glossVi ?? undefined}
              >
                <span data-hw="" lang={l}>{e.headword}</span>
                <LinkPending />
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
