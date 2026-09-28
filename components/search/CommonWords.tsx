'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LinkPending } from '@/components/ui/LinkPending'
import { entryPath } from '@/lib/dictionary/entryId'
import { LANG_LABELS } from '@/lib/dictionary/labels'
import { LANG_CODES, type LangCode } from '@/lib/languages'

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
 * Rotation stops while the pointer or the keyboard is inside the strip, and never starts
 * when the reader asked for reduced motion: moving content that cannot be paused is
 * WCAG 2.2.2.
 */
export function CommonWords({ pools }: { pools: Record<LangCode, WordChip[]> }) {
  const [from, setFrom] = useState(0)
  const [held, setHeld] = useState(false)
  // The chip pointed at, whose entry page is prefetched ahead of the click.
  const [intent, setIntent] = useState<string | null>(null)

  const longest = Math.max(...LANG_CODES.map((l) => pools[l].length))

  useEffect(() => {
    if (held || longest <= PER_PAGE) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(() => setFrom((f) => (f + PER_PAGE) % longest), ROTATE_MS)
    return () => clearInterval(timer)
  }, [held, longest])

  return (
    <div
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
    >
      <h2 className="text-xs font-semibold uppercase tracking-wide text-black/55">Từ thông dụng</h2>
      <div className="mt-3 flex flex-col gap-2">
        {LANG_CODES.map((l) => (
          <div key={l} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="w-24 shrink-0 text-xs text-black/55">{LANG_LABELS[l]}</span>
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
                className="chip-rotate rounded-full border border-black/10 px-3 py-1 text-sm hover:bg-black/5"
                title={e.glossVi ?? undefined}
              >
                {e.headword}
                <LinkPending />
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
