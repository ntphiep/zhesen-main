import { z } from '@/lib/zod'

/**
 * Which of the two lookup boxes are on screen and in which order, remembered per browser.
 *
 * An external store rather than state read in an effect, the same shape `targetLangs` uses
 * and for the same two reasons: reading storage during render is React #418 as soon as the
 * stored value differs from the server's pass, and `react-hooks/set-state-in-effect`
 * forbids the effect form outright.
 */

export type LookupMode = 'vi' | 'both' | 'fw'

export interface LookupLayout {
  mode: LookupMode
  /** True puts the foreign box on the left. Only meaningful while both are shown. */
  swapped: boolean
}

/** One frozen object: `useSyncExternalStore` compares snapshots by identity, so a fresh
 *  copy per call is an infinite render loop. */
const DEFAULT: LookupLayout = Object.freeze({ mode: 'both', swapped: false })

/** The key holds whatever a previous version or the user put there, so it is parsed, not
 *  cast, and anything unrecognised falls back to showing both. */
const stored = z.object({
  mode: z.enum(['vi', 'both', 'fw']).catch('both'),
  swapped: z.boolean().catch(false),
}).catch({ mode: 'both', swapped: false })

const KEY = 'zhesen:lookup-layout'

let current: LookupLayout | null = null
const listeners = new Set<() => void>()

function read(): LookupLayout {
  if (typeof window === 'undefined') return DEFAULT
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? Object.freeze(stored.parse(JSON.parse(raw))) : DEFAULT
  } catch {
    return DEFAULT
  }
}

export const lookupLayout = {
  subscribe(notify: () => void): () => void {
    listeners.add(notify)
    return () => { listeners.delete(notify) }
  },
  snapshot(): LookupLayout {
    return (current ??= read())
  },
  /** Answers the first client render too, so it agrees with the HTML and the stored value
   *  arrives on the render after hydration. */
  serverSnapshot(): LookupLayout {
    return DEFAULT
  },
  set(next: LookupLayout): void {
    current = Object.freeze(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(current))
    } catch {
      /* quota exceeded, or storage disabled */
    }
    for (const notify of [...listeners]) notify()
  },
  /** Forget the cached answer. For tests, which reuse the module. */
  reset(): void {
    current = null
  },
}
