/**
 * Which of the word-page layouts the reader picked, remembered per browser.
 *
 * An external store for the same reasons as `lookupLayout`: reading storage during render
 * is React #418 once the stored value differs from the server's pass, and the effect form
 * is forbidden by `react-hooks/set-state-in-effect`. The page is cached for everyone, so
 * the server renders every layout; `WORD_LAYOUT_BOOT_SCRIPT` picks the stored one before
 * the first paint (components/lookup/WordLayouts.tsx).
 */

export type WordLayout = 'overview' | 'bilingual' | 'classic' | 'map' | 'read' | 'glance'

/** What a layout needs before it is offered. Gating a layout later is one more value here
 *  and one field below. */
export type LayoutRequirement = 'learner'

export const WORD_LAYOUTS: { key: WordLayout; label: string; requires: LayoutRequirement | null }[] = [
  { key: 'overview', label: 'Tổng quan', requires: null },
  { key: 'bilingual', label: 'Song ngữ', requires: null },
  { key: 'classic', label: 'Cổ điển', requires: null },
  { key: 'map', label: 'Bản đồ nghĩa', requires: 'learner' },
  { key: 'read', label: 'Trang đọc', requires: 'learner' },
  { key: 'glance', label: 'Toàn cảnh', requires: 'learner' },
]

/** What the entry on screen has. */
export interface LayoutContext {
  learner: boolean
}

export function availableLayouts(ctx: LayoutContext): typeof WORD_LAYOUTS {
  return WORD_LAYOUTS.filter((l) => l.requires === null || ctx[l.requires])
}

/** The layout a page draws: the stored one when the entry can fill it, else the classic
 *  page, which shows every raw sense. The stored choice is kept for the next entry that
 *  has a layer. */
export function resolveLayout(stored: WordLayout, ctx: LayoutContext): WordLayout {
  return availableLayouts(ctx).some((l) => l.key === stored) ? stored : 'classic'
}

const DEFAULT: WordLayout = 'overview'
const KEY = 'zhesen:word-layout'

const isLayout = (raw: string | null): raw is WordLayout => WORD_LAYOUTS.some((l) => l.key === raw)

function parse(raw: string | null): WordLayout {
  return isLayout(raw) ? raw : DEFAULT
}

let current: WordLayout | null = null
const listeners = new Set<() => void>()

function read(): WordLayout {
  if (typeof window === 'undefined') return DEFAULT
  try {
    return parse(localStorage.getItem(KEY))
  } catch {
    return DEFAULT
  }
}

export const wordLayout = {
  subscribe(notify: () => void): () => void {
    listeners.add(notify)
    return () => { listeners.delete(notify) }
  },
  snapshot(): WordLayout {
    return (current ??= read())
  },
  /** Answers the first client render too, so it agrees with the HTML. */
  serverSnapshot(): WordLayout {
    return DEFAULT
  },
  set(next: WordLayout): void {
    current = next
    try {
      localStorage.setItem(KEY, next)
    } catch {
      /* quota exceeded, or storage disabled */
    }
    document.documentElement.dataset.wordLayout = next
    for (const notify of [...listeners]) notify()
  },
  /** Forget the cached answer. For tests, which reuse the module. */
  reset(): void {
    current = null
  },
}

/** Runs in <head> before the first paint and marks <html> with the stored layout, which
 *  `app/globals.css` uses to show that layout's panel of the word page. Only a layout that
 *  still exists: a stored name the page no longer draws would show no panel at all. The
 *  script runs before <main> exists, so whether this entry offers the stored layout is
 *  left to the CSS, which reads the `data-layouts` the server writes on <main>. */
export const WORD_LAYOUT_BOOT_SCRIPT =
  `(function(){try{var v=localStorage.getItem('${KEY}');` +
  `if(${JSON.stringify(WORD_LAYOUTS.map((l) => l.key).filter((k) => k !== DEFAULT))}.indexOf(v)>=0)` +
  `document.documentElement.dataset.wordLayout=v}catch(e){}})()`
