import { z } from '@/lib/zod'
import { isLangCode, LANG_CODES, type LangCode } from '@/lib/languages'

const KEY = 'zhesen:target-langs'

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

/** The stored choice, or all three. Safe to call during the server-rendered pass. */
export function readTargets(): LangCode[] {
  if (typeof window === 'undefined') return ALL
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? normalizeTargets(storedList.parse(JSON.parse(raw))) : ALL
  } catch {
    return ALL
  }
}

/**
 * The choice as an external store, the shape `useAiEnabled` uses and for the same reason:
 * read as lazy state it renders before hydration, and a stored choice differing from the
 * server's pass is React #418 on the summary text. `getServerSnapshot` answers the first
 * client render too, so the two agree and the stored value arrives on the next one.
 */
let current: LangCode[] | null = null
const listeners = new Set<() => void>()

export function subscribeTargets(notify: () => void): () => void {
  listeners.add(notify)
  return () => { listeners.delete(notify) }
}

export function targetsSnapshot(): LangCode[] {
  return (current ??= readTargets())
}

export function serverTargetsSnapshot(): LangCode[] {
  return ALL
}

/** Persist the choice and tell every box about it. Storage can be full or blocked, and
 *  neither is worth a crash. */
export function setTargets(langs: readonly LangCode[]): void {
  current = normalizeTargets(langs)
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    /* quota exceeded, or storage disabled */
  }
  for (const notify of [...listeners]) notify()
}

/** Forget the cached answer. For tests, which reuse the module. */
export function resetTargetsCache(): void {
  current = null
}

/** Toggling the last remaining language would ask for nothing, which the route reads as
 *  "all three". Keeping one selected makes the control mean what it shows. */
export function toggleTarget(current: readonly LangCode[], lang: LangCode): LangCode[] {
  const next = current.includes(lang) ? current.filter((l) => l !== lang) : [...current, lang]
  return next.length === 0 ? [...current] : normalizeTargets(next)
}
