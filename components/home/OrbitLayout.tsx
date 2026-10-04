'use client'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { Globe } from '@/components/home/globe/Globe'
import { entryPath } from '@/lib/dictionary/entryId'
import type { HomeView } from '@/lib/hooks/useHomeData'
import { useGlobe } from '@/lib/hooks/useGlobe'
import { useReducedMotion } from '@/lib/hooks/useReducedMotion'
import type { LangCode } from '@/lib/languages'
import { dueNote } from '@/lib/wordlist/forecast'
import type { ReviewCard } from '@/lib/wordlist/review'
import { ANCHOR, type LatLon } from './globe/motion'
import { DayStats, DueTitle, HomeBar, Hw, LookupAnswers, LookupBox, ModeLinks, NAME, ORDER, useHomeLookup, type PickerState } from './HomeParts'
import h from './Home.module.css'

/** Cities in countries where most people speak the language, far enough apart that two
 *  labels rarely meet. The app stores no place for a word, so the city carries no data:
 *  labelled words take them in queue order, every dot scatters around them. */
const CITIES: Record<LangCode, LatLon[]> = {
  en: [[-0.13, 51.5], [-74.0, 40.71], [151.2, -33.87], [-118.24, 34.05], [-79.38, 43.65], [174.76, -36.85], [-6.26, 53.35], [-87.63, 41.88], [115.86, -31.95], [-123.1, 49.28]],
  zh: [[116.4, 39.9], [121.56, 25.03], [104.07, 30.67], [103.82, 1.35], [121.47, 31.23], [113.26, 23.13], [108.94, 34.34], [126.53, 45.8], [102.71, 25.04]],
  es: [[-3.7, 40.42], [-99.13, 19.43], [-58.38, -34.6], [-74.07, 4.71], [-77.04, -12.05], [-70.67, -33.45], [-82.37, 23.11], [-5.98, 37.39], [-66.9, 10.49], [-78.47, -0.18]],
}
/** Labels on the globe before the rest of the due words wait in their language's row. */
const PINS = 18
/** A label stands above its point, so near the rim it hangs off the globe: hide it first. */
const PIN_EDGE = 0.25
/** Where a label has faded fully in. Below it the label is too faint to show a focus ring. */
const PIN_FULL = 0.65

/** How a pin's label looks at a point's `alpha` from `Globe.project`. Only a label at full
 *  strength takes focus or a click; a fading one is inert. */
export function pinLook(alpha: number, dimmed: boolean): { off: boolean; opacity: number; inert: boolean } {
  const off = dimmed || alpha < PIN_EDGE
  const opacity = off ? 0 : Math.round(Math.min(1, (alpha - PIN_EDGE) / (PIN_FULL - PIN_EDGE)) * 100) / 100
  return { off, opacity, inert: opacity < 1 }
}

interface Dot { lang: LangCode; at: LatLon }
interface Pin { card: ReviewCard; at: LatLon }

const hash = (n: number) => Math.imul(n + 1, 2654435761) >>> 0

/** Every saved word is a dot near a city of its language; the first `PINS` words of the
 *  session also carry a label. */
export function notebookMarks(view: Pick<HomeView, 'rows' | 'pending'>): { dots: Dot[]; pins: Pin[] } {
  const dots: Dot[] = []
  const pins: Pin[] = []
  const used: Record<LangCode, number> = { en: 0, zh: 0, es: 0 }
  for (const card of view.pending.slice(0, PINS)) {
    const c = CITIES[card.lang]
    pins.push({ card, at: c[used[card.lang]++ % c.length] })
  }
  view.rows.forEach((r, i) => {
    const k = hash(i)
    const base = CITIES[r.lang][k % CITIES[r.lang].length]
    const a = (k % 360) * Math.PI / 180
    const d = 1.2 + (k % 7) * 0.45
    dots.push({ lang: r.lang, at: [base[0] + Math.cos(a) * d, base[1] + Math.sin(a) * d * 0.7] })
  })
  return { dots, pins }
}

/** The key under the globe, true to what it draws when the labels run out. */
export function stageKey(pinned: number, due: number): string {
  const labels = pinned < due ? `${pinned} trong ${due} từ đến hạn hôm nay có nhãn.` : 'Từ đến hạn hôm nay có nhãn.'
  return `Mỗi chấm là một từ trong sổ tay. ${labels}`
}

/** "Quả cầu của tôi": the landing page's globe holding the reader's notebook. Every saved
 *  word is a dot in a country of its language; the first words due today carry their headword.
 *  The streak and the goal sit under it. */
export function OrbitLayout({ view, failed, onRetry, picker }: { view: HomeView | null; failed: boolean; onRetry: () => void; picker: PickerState }) {
  const lookup = useHomeLookup()
  const reduced = useReducedMotion()
  const [open, setOpen] = useState<LangCode | null>(null)
  const [stopped, setStopped] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const pinEls = useRef(new Map<string, HTMLAnchorElement>())
  const { globe } = useGlobe(canvas, { center: [120, 25], spin: 4 })

  const { dots, pins } = useMemo(() => (view ? notebookMarks(view) : { dots: [], pins: [] }), [view])

  const state = useRef({ dots, pins, open })
  useEffect(() => { state.current = { dots, pins, open }; globe?.kick(); globe?.draw() }, [dots, pins, open, globe])

  useEffect(() => {
    if (!globe) return
    let colors: { of: object; ink: string; bg: string } | null = null
    const tone = (g: Globe) => {
      const of = g.palette()
      if (colors?.of !== of) {
        const cs = getComputedStyle(canvas.current ?? document.documentElement)
        colors = { of, ink: cs.getPropertyValue('--zs-ink').trim(), bg: cs.getPropertyValue('--zs-bg').trim() }
      }
      return colors
    }
    const layer = (ctx: CanvasRenderingContext2D, g: Globe) => {
      const { ink, bg } = tone(g)
      const only = state.current.open
      for (const d of state.current.dots) {
        if (only && d.lang !== only) continue
        const s = g.project(d.at)
        if (!s.visible) continue
        ctx.globalAlpha = s.alpha
        ctx.beginPath(); ctx.arc(s.x, s.y, 3.4, 0, 7); ctx.fillStyle = bg; ctx.fill()
        ctx.beginPath(); ctx.arc(s.x, s.y, 2.1, 0, 7); ctx.fillStyle = ink; ctx.fill()
      }
      ctx.globalAlpha = 1
    }
    const move = (g: Globe) => {
      const only = state.current.open
      for (const p of state.current.pins) {
        const el = pinEls.current.get(p.card.id)
        if (!el) continue
        const s = g.project(p.at)
        const look = pinLook(s.alpha, only !== null && p.card.lang !== only)
        if (look.off) el.dataset.off = ''
        else delete el.dataset.off
        el.inert = look.inert
        el.style.opacity = look.off ? '' : String(look.opacity)
        el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, calc(-100% - 8px))`
      }
    }
    globe.layers.push(layer)
    globe.frameHooks.push(move)
    globe.draw()
    return () => {
      globe.layers.splice(globe.layers.indexOf(layer), 1)
      globe.frameHooks.splice(globe.frameHooks.indexOf(move), 1)
    }
  }, [globe])

  function toggle(lang: LangCode) {
    const next = open === lang ? null : lang
    setOpen(next)
    if (!globe) return
    if (next) { globe.pause(6000); void globe.rotateTo(ANCHOR[next], 900) }
    globe.showOnly(next)
  }

  function toggleMotion() {
    if (!globe) return
    setStopped(globe.toggleStopped())
  }

  return (
    <div>
      <HomeBar now={view?.now ?? null} picker={picker} />
      <section className={`${h.wrap} ${h.mine}`} aria-label="Hôm nay">
        <div>
          <DueTitle due={view?.due ?? null} failed={failed} onRetry={onRetry} />
          <div className={h.sub}>
            <Link className={h.btn} href="/practice/review" prefetch={false}>Ôn ngay</Link>
          </div>
          <ModeLinks />
          <LookupBox lookup={lookup} placeholder="giấc mơ" />
          {view && <Languages view={view} open={open} onToggle={toggle} />}
        </div>
        <div className={h.globeCol}>
          <div className={h.stage}>
            <canvas ref={canvas} className={h.globe} tabIndex={0} aria-label="Quả địa cầu với các từ trong sổ tay. Dùng phím mũi tên để xoay." />
            <div className={h.dpins}>
              {pins.map((p) => (
                <Link
                  key={p.card.id}
                  ref={(el) => { if (el) pinEls.current.set(p.card.id, el); else pinEls.current.delete(p.card.id) }}
                  className={h.dpin}
                  data-l={p.card.lang}
                  data-off=""
                  inert
                  href={p.card.entryId ? entryPath(p.card.entryId) : '/wordlist'}
                  prefetch={false}
                >
                  <Hw lang={p.card.lang} text={p.card.headword} />
                  <span className={h.sr}>, {NAME[p.card.lang]}, {dueNote(p.card.state.reps, p.card.state.dueAt, view?.now ?? 0)}</span>
                </Link>
              ))}
            </div>
            <button
              type="button"
              className={h.motion}
              hidden={reduced || !globe}
              aria-pressed={stopped}
              aria-label="Dừng quả cầu"
              onClick={toggleMotion}
            >
              {stopped ? PLAY : PAUSE}
            </button>
          </div>
          <p className={h.stageKey}><i />{stageKey(pins.length, view?.pending.length ?? 0)}</p>
        </div>
      </section>

      <LookupAnswers lookup={lookup} />

      <div className={`${h.wrap} ${h.sec}`}>
        <DayStats view={view} />
      </div>
    </div>
  )
}

/** One row per language: its words, how many are due, and a meter of learned, learning
 *  and never graded. Opening a row lists its due words and turns the globe to it. */
function Languages({ view, open, onToggle }: { view: HomeView; open: LangCode | null; onToggle: (l: LangCode) => void }) {
  const id = useId()
  return (
    <>
      <ul className={h.langs}>
        {ORDER.map((lang) => {
          const p = view.progress[lang]
          const due = view.pending.filter((c) => c.lang === lang)
          const pct = (n: number) => `${(n / Math.max(1, p.total) * 100).toFixed(1)}%`
          const isOpen = open === lang
          return (
            <li key={lang} className={h.lrow} data-l={lang} data-open={isOpen || undefined}>
              <button type="button" aria-expanded={isOpen} aria-controls={`${id}-${lang}`} onClick={() => onToggle(lang)}>
                <span className={h.swatch} aria-hidden="true" />
                <span><span className={h.nm}>{NAME[lang]}</span> <span className={h.ct}>{p.total} từ</span></span>
                <span className={h.due}>{due.length ? `${due.length} đến hạn` : 'Chưa có từ đến hạn'}</span>
                <span className={h.meter} data-grow="" aria-hidden="true">
                  <i className={h.k} style={{ width: pct(p.learned) }} />
                  <i className={h.g} style={{ width: pct(p.learning) }} />
                </span>
                <span className={h.sr}>{p.learned} từ đã thuộc, {p.learning} từ đang học, {p.unseen} từ chưa ôn.</span>
              </button>
              <div className={h.body} id={`${id}-${lang}`}>
                <div inert={!isOpen}>
                  {due.length > 0 && (
                    <ul className={h.dl}>
                      {due.map((c) => (
                        <li key={c.id}>
                          <Link href={c.entryId ? entryPath(c.entryId) : '/wordlist'} prefetch={false}>
                            <Hw lang={c.lang} text={c.headword} /><small>{dueNote(c.state.reps, c.state.dueAt, view.now)}</small>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className={h.lfoot}>{p.learned} từ đã thuộc, {p.learning} từ đang học{p.unseen > 0 && `, ${p.unseen} từ chưa ôn`}.</p>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
      <p className={h.meterKey}><i /><span>Đã thuộc</span><i data-k="g" /><span>Đang học</span><i data-k="u" /><span>Chưa ôn</span></p>
    </>
  )
}

const PAUSE = <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="3" width="3" height="10" rx="1" /><rect x="9.5" y="3" width="3" height="10" rx="1" /></svg>
const PLAY = <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L5.9 2.7a.6.6 0 0 0-.9.5z" /></svg>
