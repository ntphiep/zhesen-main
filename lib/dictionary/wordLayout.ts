/**
 * Which of the three word-page layouts the reader picked, remembered per browser.
 *
 * An external store for the same reasons as `lookupLayout`: reading storage during render
 * is React #418 once the stored value differs from the server's pass, and the effect form
 * is forbidden by `react-hooks/set-state-in-effect`. The page is cached for everyone, so
 * the server always renders the default; `WORD_LAYOUT_BOOT_SCRIPT` hides it before the
 * first paint when another layout is stored, until the client renders that one.
 */

export type WordLayout = 'overview' | 'bilingual' | 'classic'

export const WORD_LAYOUTS: { key: WordLayout; label: string }[] = [
  { key: 'overview', label: 'Tổng quan' },
  { key: 'bilingual', label: 'Song ngữ' },
  { key: 'classic', label: 'Cổ điển' },
]

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
 *  `app/globals.css` uses to hide a word page rendered in another one. Only a layout that
 *  still exists: a stored name the page no longer draws would hide it for nothing. */
export const WORD_LAYOUT_BOOT_SCRIPT =
  `(function(){try{var v=localStorage.getItem('${KEY}');` +
  `if(${JSON.stringify(WORD_LAYOUTS.map((l) => l.key).filter((k) => k !== DEFAULT))}.indexOf(v)>=0)` +
  `document.documentElement.dataset.wordLayout=v}catch(e){}})()`
