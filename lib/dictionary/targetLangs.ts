import { z } from '@/lib/zod'
import { isLangCode, LANG_CODES, type LangCode } from '@/lib/languages'

/** The key holds whatever a previous version, another tab or the user put there, so it
 *  must be parsed, not cast, exactly as `recent.ts` parses its own list. */
const storedList = z.string().array().catch([])

/** One frozen array, because `useSyncExternalStore` compares snapshots by identity and a
 *  fresh copy per call is an infinite render loop. */
const ALL: LangCode[] = [...LANG_CODES]

/** The canonical order, so `en,es` and `es,en` are one request and one cache entry. */
export function normalizeTargets(langs: readonly string[]): LangCode[] {
  const asked = new Set(langs.filter(isLangCode))
  const picked = LANG_CODES.filter((l) => asked.has(l))
  return picked.length > 0 ? picked : ALL
}

/** Toggling the last remaining language would ask for nothing, which the route reads as
 *  "all three". Keeping one selected makes the control mean what it shows. */
export function toggleTarget(current: readonly LangCode[], lang: LangCode): LangCode[] {
  const next = current.includes(lang) ? current.filter((l) => l !== lang) : [...current, lang]
  return next.length === 0 ? [...current] : normalizeTargets(next)
}

export interface LangStore {
  read: () => LangCode[]
  subscribe: (notify: () => void) => () => void
  snapshot: () => LangCode[]
  serverSnapshot: () => LangCode[]
  set: (langs: readonly LangCode[]) => void
  /** Forget the cached answer. For tests, which reuse the module. */
  reset: () => void
}

/**
 * A remembered set of languages, as an external store: the shape `useAiEnabled` uses and
 * for the same reason. Read as lazy state the value renders before hydration, and a stored
 * choice differing from the server's pass is React #418 on the summary text.
 * `serverSnapshot` answers the first client render too, so the two agree and the stored
 * value arrives on the next one.
 *
 * One store per question. The Vietnamese box chooses which languages to translate into and
 * the foreign box chooses which to search in; sharing a key would make turning Chinese off
 * in one turn it off in the other.
 */
function createLangStore(key: string): LangStore {
  let current: LangCode[] | null = null
  const listeners = new Set<() => void>()

  function read(): LangCode[] {
    if (typeof window === 'undefined') return ALL
    try {
      const raw = localStorage.getItem(key)
      return raw ? normalizeTargets(storedList.parse(JSON.parse(raw))) : ALL
    } catch {
      return ALL
    }
  }

  return {
    read,
    subscribe(notify) {
      listeners.add(notify)
      return () => { listeners.delete(notify) }
    },
    snapshot() {
      return (current ??= read())
    },
    serverSnapshot() {
      return ALL
    },
    set(langs) {
      current = normalizeTargets(langs)
      try {
        localStorage.setItem(key, JSON.stringify(current))
      } catch {
        /* quota exceeded, or storage disabled */
      }
      for (const notify of [...listeners]) notify()
    },
    reset() {
      current = null
    },
  }
}

/** Which languages the Vietnamese box translates into. */
export const targetLangs = createLangStore('zhesen:target-langs')

/** Which languages the foreign box searches in. */
export const sourceLangs = createLangStore('zhesen:source-langs')
