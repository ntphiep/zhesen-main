'use client'
import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { homeLayout, sessionMarked, type HomeLayout } from '@/lib/home/homeLayout'
import { useAccount } from '@/lib/hooks/useAccount'
import { useHomeData } from '@/lib/hooks/useHomeData'
import { DeskLayout } from './DeskLayout'
import { OrbitLayout } from './OrbitLayout'
import { TodayLayout, type DailyTrio } from './TodayLayout'
import { newsreader } from './fonts'
import l from './Landing.module.css'
import h from './Home.module.css'

type Panel = 'landing' | HomeLayout
const PANELS: Panel[] = ['landing', 'desk', 'today', 'orbit']

const noop = () => () => {}
/** False on the server and through hydration, true from the first render after it. */
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false)
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
  const { view, status, supabase, graded } = useHomeData(hydrated && signed)

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

  function body(key: Panel): ReactNode {
    switch (key) {
      case 'landing': return landing
      case 'desk': return <DeskLayout view={view} failed={failed} picker={picker} />
      case 'today': return <TodayLayout view={view} failed={failed} picker={picker} daily={daily} supabase={supabase} onGraded={graded} />
      case 'orbit': return <OrbitLayout view={view} failed={failed} picker={picker} />
    }
  }

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
