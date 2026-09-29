import { SUPABASE_AUTH_COOKIE } from '@/lib/supabase/env'

/**
 * Which of the signed-in home's layouts the reader picked, remembered per browser, and
 * whether this browser holds a permanent account's session. The same external-store shape as
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

/** Whether <html> says this browser holds a permanent session: the boot script's guess from the
 *  cookie, corrected by HomeSwitch once the account kind is known. */
export function sessionMarked(): boolean {
  return document.documentElement.hasAttribute('data-session')
}

/** Runs in <head> before the first paint. Marks <html> with `data-session` only for a
 *  permanent account's session that is unexpired or carries a refresh token, so an anonymous
 *  one never paints a frame of the home, and with the stored layout when it is one the page
 *  still draws, which `app/globals.css` reads to show one panel of `/`. `/` is cached and
 *  outside `proxy.ts`, so an expired token is refreshed only in the browser; if that fails,
 *  HomeSwitch drops the mark once `useAccount` answers.
 *
 *  `@supabase/ssr` 0.12 keeps auth-js's session JSON in the cookie whole, or in chunks `.0`,
 *  `.1`... joined in order, as `base64-` plus base64url, and sets `httpOnly: false`
 *  (node_modules/@supabase/ssr/dist/main/cookies.js, utils/chunker.js). Anything it cannot
 *  read counts as no session. */
export const HOME_BOOT_SCRIPT =
  `(function(){var d=document.documentElement,n=${JSON.stringify(SUPABASE_AUTH_COOKIE)};` +
  `try{var whole=null,parts=[];document.cookie.split(/;\\s*/).forEach(function(c){` +
  `var i=c.indexOf('='),k=c.slice(0,i),v=c.slice(i+1),x=k.slice(n.length+1);` +
  `if(k===n)whole=v;else if(k.indexOf(n+'.')===0&&/^\\d+$/.test(x))parts[+x]=v});` +
  `var raw=decodeURIComponent(whole!==null?whole:parts.join(''));` +
  `if(raw.indexOf('base64-')===0)raw=atob(raw.slice(7).replace(/-/g,'+').replace(/_/g,'/'));` +
  `var s=JSON.parse(raw),u=s&&s.user;` +
  `if(u&&u.email&&!u.is_anonymous&&(s.refresh_token||s.expires_at*1000>Date.now()))d.dataset.session=''}catch(e){}` +
  `try{var v=localStorage.getItem('${KEY}');` +
  `if(${JSON.stringify(HOME_LAYOUTS.map((l) => l.key).filter((k) => k !== DEFAULT_HOME_LAYOUT))}.indexOf(v)>=0)` +
  `d.dataset.homeLayout=v}catch(e){}})()`
