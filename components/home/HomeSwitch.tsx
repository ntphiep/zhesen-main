'use client'
import { lazy, memo, startTransition, Suspense, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { homeLayout, sessionMarked, type HomeLayout } from '@/lib/home/homeLayout'
import { useAccount } from '@/lib/hooks/useAccount'
import { useHomeData, type HomeView } from '@/lib/hooks/useHomeData'
import type { SrsState } from '@/lib/progress/types'
import type { DailyTrio } from './TodayLayout'
import { newsreader } from './fonts'

// Loaded only where a layout renders: the server draws all three, a visitor's browser none.
const DeskLayout = lazy(() => import('./DeskLayout').then((m) => ({ default: m.DeskLayout })))
const TodayLayout = lazy(() => import('./TodayLayout').then((m) => ({ default: m.TodayLayout })))
const OrbitLayout = lazy(() => import('./OrbitLayout').then((m) => ({ default: m.OrbitLayout })))
import l from './Landing.module.css'
import h from './Home.module.css'

type Panel = 'landing' | HomeLayout
const PANELS: Panel[] = ['landing', 'desk', 'today', 'orbit']

const noop = () => () => {}
/** False on the server and through hydration, true from the first render after it. The flip
 *  is a transition: a blocking update reaching a layout that is still hydrating makes React
 *  swap its server HTML for the empty fallback, which blanked the page for a frame. */
function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => { startTransition(() => setHydrated(true)) }, [])
  return hydrated
}
/** What the boot script, or a later correction below, wrote on <html>. */
const useMarked = () => useSyncExternalStore(noop, sessionMarked, () => false)

/** What a hidden panel renders while hydrating: nothing React compares or patches. */
const DORMANT = { __html: '' }
/** The home layouts share the landing page's type scale and fonts. */
const HOME_CLASS = `${l.landing} ${newsreader.variable} ${h.home}`
const panelClass = (key: Panel) => (key === 'landing' ? undefined : HOME_CLASS)

/**
 * `/` for a visitor, or the reader's own home for a permanent account, from one cached page.
 *
 * The server knows neither, so it draws every panel: the landing page in full, and the
 * static parts of the three home layouts. `HOME_BOOT_SCRIPT` marks <html> from the auth
 * cookie and the stored layout before the first paint, `app/globals.css` shows that one
 * panel, and hydration works on it alone, the others hydrating as empty
 * `dangerouslySetInnerHTML` exactly as in `WordLayouts`. So a visitor's browser never mounts
 * a home layout, and a reader's never mounts the landing page and its globe. Once the
 * account is known the mark on <html> is corrected: an anonymous session sees the landing.
 */
export function HomeSwitch({ landing, daily }: { landing: ReactNode; daily: DailyTrio | null }) {
  const stored = useSyncExternalStore(homeLayout.subscribe, homeLayout.snapshot, homeLayout.serverSnapshot)
  const hydrated = useHydrated()
  const marked = useMarked()
  const { kind } = useAccount()
  const signed = kind === null ? marked : kind === 'permanent'
  // The mark only says what the cookie claims; nothing is read until the account is known.
  const { view, status, supabase, graded, retry } = useHomeData(hydrated && kind === 'permanent')

  useEffect(() => {
    if (kind === null) return
    const html = document.documentElement
    if (kind === 'permanent') html.dataset.session = ''
    else delete html.dataset.session
  }, [kind])

  const chosen: Panel = signed && status !== 'none' ? stored : 'landing'
  const panels = hydrated ? [chosen] : PANELS
  const overServerHtml = !hydrated && typeof document !== 'undefined' && document.querySelector('main[data-home-boot]') !== null
  const shown: Panel | null = overServerHtml ? (sessionMarked() ? homeLayout.snapshot() : 'landing') : null
  const picker = { value: hydrated ? stored : null, stored: hydrated ? stored : null }
  const failed = status === 'failed'

  const body = (key: Panel): ReactNode => (key === 'landing' ? landing : (
    <Layout
      name={key} view={view} failed={failed} onRetry={retry} value={picker.value} stored={picker.stored}
      daily={daily} supabase={supabase} onGraded={graded}
    />
  ))

  return (
    <main data-home-boot={hydrated ? undefined : ''} data-rendered-home={chosen}>
      {panels.map((key) => (shown !== null && key !== shown
        ? <div key={key} data-home-panel={key} className={panelClass(key)} suppressHydrationWarning dangerouslySetInnerHTML={DORMANT} />
        : (
          <div key={key} data-home-panel={key} className={panelClass(key)}>
            {body(key)}
          </div>
        )))}
    </main>
  )
}

interface LayoutProps {
  name: HomeLayout
  view: HomeView | null
  failed: boolean
  onRetry: () => void
  value: HomeLayout | null
  stored: HomeLayout | null
  daily: DailyTrio | null
  supabase: SupabaseClient | null
  onGraded: (id: string, next: SrsState, back: boolean) => void
}

/** A layout behind its own boundary, so one still loading holds its server HTML while
 *  hydrating. Memoised on plain props, so a render that changes nothing it draws, such as
 *  the boot marks settling after hydration, never reaches that boundary. */
const Layout = memo(function Layout({ name, value, stored, view, failed, onRetry, daily, supabase, onGraded }: LayoutProps) {
  const picker = { value, stored }
  return (
    <Suspense>
      {name === 'desk' && <DeskLayout view={view} failed={failed} onRetry={onRetry} picker={picker} />}
      {name === 'today' && <TodayLayout view={view} failed={failed} onRetry={onRetry} picker={picker} daily={daily} supabase={supabase} onGraded={onGraded} />}
      {name === 'orbit' && <OrbitLayout view={view} failed={failed} onRetry={onRetry} picker={picker} />}
    </Suspense>
  )
})
