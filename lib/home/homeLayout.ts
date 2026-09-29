import { SUPABASE_AUTH_COOKIE } from '@/lib/supabase/env'

/**
 * Which of the signed-in home's layouts the reader picked, remembered per browser, and
 * whether this browser carries a session at all. The same external-store shape as
 * `lib/dictionary/wordLayout.ts`, for the same reasons: `/` is cached for everyone, so the
 * server draws every panel and `HOME_BOOT_SCRIPT` marks <html> before the first paint
 * (components/home/HomeSwitch.tsx).
 */

export type HomeLayout = 'desk' | 'today' | 'orbit'

export const HOME_LAYOUTS: { key: HomeLayout; label: string }[] = [
  { key: 'desk', label: 'Bàn học' },
  { key: 'today', label: 'Ôn ngay' },
  { key: 'orbit', label: 'Quả cầu của tôi' },
]

export const DEFAULT_HOME_LAYOUT: HomeLayout = 'desk'
const KEY = 'zhesen:home-layout'

const isHomeLayout = (raw: string | null): raw is HomeLayout => HOME_LAYOUTS.some((l) => l.key === raw)

/** A stored name the page no longer draws would show no panel at all, so it reads as the default. */
export function parseHomeLayout(raw: string | null): HomeLayout {
  return isHomeLayout(raw) ? raw : DEFAULT_HOME_LAYOUT
}

/** `@supabase/ssr` writes the session whole, or in chunks from `.0` once it outgrows one
 *  cookie. It sets `httpOnly: false`, so a script can see either. */
const SESSION_COOKIE = new RegExp(`(?:^|;\\s*)${SUPABASE_AUTH_COOKIE}(?:\\.0)?=`)

export function hasSessionCookie(cookie: string): boolean {
  return SESSION_COOKIE.test(cookie)
}

let current: HomeLayout | null = null
const listeners = new Set<() => void>()

function read(): HomeLayout {
  if (typeof window === 'undefined') return DEFAULT_HOME_LAYOUT
  try {
    return parseHomeLayout(localStorage.getItem(KEY))
  } catch {
    return DEFAULT_HOME_LAYOUT
  }
}

export const homeLayout = {
  subscribe(notify: () => void): () => void {
    listeners.add(notify)
    return () => { listeners.delete(notify) }
  },
  snapshot(): HomeLayout {
    return (current ??= read())
  },
  /** Answers the first client render too, so it agrees with the HTML. */
  serverSnapshot(): HomeLayout {
    return DEFAULT_HOME_LAYOUT
  },
  set(next: HomeLayout): void {
    current = next
    try {
      localStorage.setItem(KEY, next)
    } catch {
      /* quota exceeded, or storage disabled */
    }
    document.documentElement.dataset.homeLayout = next
    for (const notify of [...listeners]) notify()
  },
  /** Forget the cached answer. For tests, which reuse the module. */
  reset(): void {
    current = null
  },
}

/** Whether <html> says this browser holds a session: the boot script's guess from the
 *  cookie, corrected by HomeSwitch once the account kind is known. */
export function sessionMarked(): boolean {
  return document.documentElement.hasAttribute('data-session')
}

/** Runs in <head> before the first paint. Marks <html> with `data-session` when the auth
 *  cookie is present and with the stored layout when it is one the page still draws, which
 *  `app/globals.css` reads to show one panel of `/`. */
export const HOME_BOOT_SCRIPT =
  `(function(){try{var d=document.documentElement;` +
  `if(${SESSION_COOKIE.toString()}.test(document.cookie))d.dataset.session='';` +
  `var v=localStorage.getItem('${KEY}');` +
  `if(${JSON.stringify(HOME_LAYOUTS.map((l) => l.key).filter((k) => k !== DEFAULT_HOME_LAYOUT))}.indexOf(v)>=0)` +
  `d.dataset.homeLayout=v}catch(e){}})()`
