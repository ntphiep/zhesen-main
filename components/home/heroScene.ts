import type { Globe, Hit } from './globe/Globe'
import type { Unroll } from './globe/unroll'
import type { World } from './globe/world'
import { ANCHOR, clamp, ease, HANOI, LEGS, PLACES, P_SWAP, seg, type Lang, type LatLon } from './globe/motion'
import { fetchSearch, REFUSED_MESSAGE } from '@/lib/dictionary/searchClient'
import { initialSrsState, review } from '@/lib/progress/srs'
import type { Answers } from '@/lib/home/landing'
import { seenWords } from '@/lib/home/seenWords'
import { stopWriting, writeWord } from './strokes'

/** The imperative half of the landing page's first screen: the looked-up word flying from
 *  Hà Nội to each language on the globe, the pins, the tooltip, and the scroll that opens
 *  the globe into three lanes. React draws the text; this moves what a render cannot. */

export const ORDER: readonly Lang[] = ['en', 'zh', 'es']

type Result = { entries: Answers } | { error: string }
const answers = new Map<string, Promise<Result>>()
const keyOf = (q: string) => q.normalize('NFC').trim().toLowerCase()

/** An answer the server already read, so the first lookup costs no request. */
export function seedAnswer(q: string, entries: Answers): void {
  answers.set(keyOf(q), Promise.resolve({ entries }))
}

function search(q: string): Promise<Result> {
  const key = keyOf(q)
  const hit = answers.get(key)
  if (hit) return hit
  const next = fetchSearch(key, undefined, { dir: 'vi' }).then(
    (o): Result => (o.status === 'ok' ? { entries: o.data.entries } : { error: o.message }),
    (): Result => ({ error: REFUSED_MESSAGE }),
  )
  answers.set(key, next)
  // A refusal is worth asking again next time.
  void next.then((r) => { if ('error' in r) answers.delete(key) })
  return next
}

export interface HeroElements {
  section: HTMLElement
  stick: HTMLElement
  map: HTMLCanvasElement
  lanes: HTMLElement
  /** The heading of the first lane: the lanes' countries start below it. */
  laneHead: HTMLElement
  front: HTMLElement
  intro: HTMLElement
  globeCol: HTMLElement
  legend: HTMLElement
  key: HTMLElement
  cue: HTMLElement
  stage: HTMLElement
  hero: HTMLCanvasElement
  pins: HTMLElement
  tip: HTMLElement
}

export interface Shown {
  query: string
  entries: Answers
  user: boolean
  /** Drawn at once, without the tour: reduced motion, or the globe paused or absent. */
  still: boolean
  seq: number
}

/** What the scene tells React to draw. */
export interface HeroView {
  show(shown: Shown): void
  land(lang: Lang): void
  fail(message: string): void
  due(text: string): void
  status(text: string): void
  pinned(lang: Lang | null): void
  hot(langs: Lang[]): void
}

interface Arc { from: LatLon; to: LatLon; t0: number; dur: number }
interface Pin { at: LatLon; el: HTMLElement; below: boolean }

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const phone = () => innerWidth <= 760
const wait = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms))

const NAMES: Record<Lang, string> = { en: 'tiếng Anh', zh: 'tiếng Trung', es: 'tiếng Tây Ban Nha' }

function tipFor(hit: Hit | null): { name: string; line: string } | null {
  if (!hit) return null
  if (hit.vn) return { name: 'Việt Nam', line: 'Tiếng Việt' }
  const info = hit.info
  const ls = ORDER.filter((l) => info.langs[l])
  if (!ls.length) return null
  const label = (l: Lang) => NAMES[l] + (l === 'zh' && info.hant ? ', chữ phồn thể' : '')
  const first = label(ls[0])
  const line = ls.length > 1 ? `Dùng cả ${first} và ${label(ls[1])}`
    : info.langs[ls[0]] === 'strong' ? `Phần lớn người dân nói ${first}`
    : `${first[0].toUpperCase()}${first.slice(1)} là ngôn ngữ chính thức`
  return { name: info.vi, line }
}

/** When a word saved now and remembered first time comes back. */
function dueText(): string {
  const now = Date.now()
  const d = new Date(review(initialSrsState('landing', now), 'good', now).dueAt)
  return `vào ngày ${d.getDate()}/${d.getMonth() + 1}`
}

export class HeroScene {
  /** The legend chip the visitor pressed, or null. */
  pinnedLang: Lang | null = null
  /** A tour of the arcs is running, so pausing restarts the lookup as a still one. */
  touring = false
  private globe: Globe | null = null
  private unroll: Unroll | null = null
  private arcs: Arc[] = []
  private pins: Pin[] = []
  private seq = 0
  private heroA = 1
  private p = 0
  private kT = 0
  private dirty = true
  private held = false
  private counted = false
  private wrote = false
  private raf = 0
  private running = false
  private tipTimer = 0
  private readonly cleanup: (() => void)[] = []

  constructor(private readonly el: HeroElements, private readonly view: HeroView, private readonly pinClass: string) {
    const onScroll = () => { this.dirty = true }
    addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(() => this.resize())
    ro.observe(el.map)
    // The section is 430vh tall, so it intersects for the whole of the unrolling.
    const io = new IntersectionObserver((e) => (e[0].isIntersecting ? this.start() : this.stop()))
    io.observe(el.section)
    this.cleanup.push(() => removeEventListener('scroll', onScroll), () => ro.disconnect(), () => io.disconnect())
  }

  destroy(): void {
    this.seq++
    this.stop()
    clearTimeout(this.tipTimer)
    this.cleanup.forEach((f) => f())
    stopWriting()
  }

  async attach(globe: Globe, world: World): Promise<void> {
    this.globe = globe
    globe.layers.push((ctx, g) => this.arcLayer(ctx, g))
    globe.frameHooks.push((g) => this.placePins(g))
    const { Unroll } = await import('./globe/unroll')
    this.unroll = new Unroll(this.el.map, world, globe, this.el.hero, () => this.el.laneHead.getBoundingClientRect().bottom, phone)
    this.resize()
  }

  resize(): void {
    if (this.unroll) this.el.lanes.style.setProperty('--sil', `${this.unroll.resize()}px`)
    if (this.globe) this.placePins(this.globe)
    this.dirty = true
  }

  themeChanged(): void {
    this.unroll?.themeChanged()
    this.dirty = true
  }

  /** The lanes were drawn again for a new answer: count and write once more. */
  refilled(): void {
    this.counted = false
    this.wrote = false
    stopWriting()
    if (this.kT > 0.5) this.countUp()
    this.dirty = true
  }

  async run(q: string, user: boolean): Promise<void> {
    const query = q.normalize('NFC').trim()
    if (!query) return
    const my = ++this.seq
    const res = await search(query)
    if (my !== this.seq) return
    if ('error' in res) { this.view.fail(res.error); return }
    const { entries } = res
    const globe = this.globe
    const still = reduced() || !globe || globe.stopped
    this.touring = !still
    this.arcs = []
    this.pins.forEach((p) => p.el.remove())
    this.pins = []
    const top = (l: Lang) => entries[l][0]
    const has = (l: Lang) => entries[l].length > 0
    this.view.show({ query, entries, user, still, seq: my })
    this.view.due(dueText())
    seenWords.add(query, ORDER.flatMap((l) => entries[l].slice(0, 1)))
    this.pinnedLang = null
    this.view.pinned(null)
    if (user) this.view.status(`${ORDER.filter(has).length} ngôn ngữ có kết quả cho ${query}`)
    if (!globe) return
    globe.only = null
    if (still) {
      globe.setLit({ en: has('en') ? 1 : 0, zh: has('zh') ? 1 : 0, es: has('es') ? 1 : 0 })
      for (const leg of LEGS) for (const h of leg.hops) if (has(h.lang)) {
        const to = PLACES[h.to]
        this.arcs.push({ from: PLACES[h.from].at, to: to.at, t0: 0, dur: 1 })
        this.addPin(globe, to.at, top(h.lang).headword, h.lang, to.city, to.below)
      }
      await globe.rotateTo(LEGS[1].view, 0)
      return
    }
    globe.setLit({ en: 0, zh: 0, es: 0 })
    globe.hold(true)
    try {
      for (const leg of LEGS) {
        const hops = leg.hops.filter((h) => has(h.lang))
        if (!hops.length) continue
        await globe.rotateTo(leg.view, 1100)
        if (my !== this.seq) return
        const t0 = performance.now()
        hops.forEach((h, i) => this.arcs.push({ from: PLACES[h.from].at, to: PLACES[h.to].at, t0: t0 + i * 140, dur: 760 }))
        globe.animating = true
        globe.kick()
        await wait(760 + (hops.length - 1) * 140)
        if (my !== this.seq) return
        for (const h of hops) {
          const to = PLACES[h.to]
          this.addPin(globe, to.at, top(h.lang).headword, h.lang, to.city, to.below)
          globe.setLit({ [h.lang]: 1 })
          this.view.land(h.lang)
        }
        await wait(520)
        if (my !== this.seq) return
      }
    } finally {
      globe.hold(false)
      if (my === this.seq) this.touring = false
    }
  }

  /** A legend chip under the pointer or focus shows its countries alone; null restores the pressed one. */
  preview(lang: Lang | null): void {
    if (!this.globe) return
    this.globe.only = lang ?? this.pinnedLang
    this.globe.kick()
  }

  press(lang: Lang): void {
    this.pinnedLang = this.pinnedLang === lang ? null : lang
    this.view.pinned(this.pinnedLang)
    const globe = this.globe
    if (!globe) return
    globe.only = this.pinnedLang
    globe.pause(4000)
    if (this.pinnedLang) void globe.rotateTo(ANCHOR[lang], 900)
    globe.kick()
  }

  /** Pause or resume the globe; returns whether it is now stopped. */
  toggleMotion(): boolean {
    const globe = this.globe
    if (!globe) return false
    globe.stopped = !globe.stopped
    globe.kick()
    return globe.stopped
  }

  hover(hit: Hit | null, x: number, y: number): void {
    this.showTip(hit, x, y)
    this.view.hot(hit && !hit.vn ? ORDER.filter((l) => hit.info.langs[l]) : [])
  }

  tap(hit: Hit | null, x: number, y: number): void {
    this.showTip(hit, x, y)
    clearTimeout(this.tipTimer)
    this.tipTimer = window.setTimeout(() => { delete this.el.tip.dataset.on }, 2400)
  }

  private showTip(hit: Hit | null, x: number, y: number): void {
    const tip = this.el.tip
    const text = this.p > 0.01 ? null : tipFor(hit)
    if (!text) { delete tip.dataset.on; return }
    const name = document.createElement('b')
    name.textContent = text.name
    tip.replaceChildren(name, text.line)
    const w = tip.offsetWidth, stage = this.el.stage.clientWidth
    tip.style.transform = `translate(${Math.min(stage - w, Math.max(0, x + 14))}px, ${y + 14}px)`
    tip.dataset.on = ''
  }

  private arcLayer(ctx: CanvasRenderingContext2D, g: Globe): void {
    const now = performance.now()
    let running = false
    const col = g.palette()
    for (const a of this.arcs) {
      const t = clamp((now - a.t0) / a.dur, 0, 1)
      if (t <= 0) { running = true; continue }
      if (t < 1) running = true
      ctx.globalAlpha = (t < 1 ? 0.9 : 0.4) * this.heroA
      g.strokeArc(ctx, a.from, a.to, ease(t), col.vn, 1.6)
      ctx.globalAlpha = 1
    }
    const h = g.project(HANOI)
    if (h.visible) {
      ctx.beginPath(); ctx.arc(h.x, h.y, 4.5, 0, 7); ctx.fillStyle = col.ocean; ctx.fill()
      ctx.beginPath(); ctx.arc(h.x, h.y, 3, 0, 7); ctx.fillStyle = col.vn; ctx.fill()
    }
    g.animating = running
  }

  private placePins(g: Globe): void {
    for (const p of this.pins) {
      const s = g.project(p.at)
      p.el.toggleAttribute('data-off', !s.visible)
      if ('on' in p.el.dataset) p.el.style.opacity = s.alpha.toFixed(2)
      const at = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, ${p.below ? '12%' : '-112%'})`
      p.el.style.setProperty('--at', at)
      p.el.style.transform = at
    }
  }

  private addPin(g: Globe, at: LatLon, text: string, lang: Lang, city: string, below: boolean): void {
    const el = document.createElement('span')
    el.className = this.pinClass
    el.dataset.l = lang
    const word = document.createElement('b')
    word.lang = lang
    word.textContent = text
    const place = document.createElement('i')
    place.textContent = city
    el.append(word, place)
    this.el.pins.append(el)
    this.pins.push({ at, el, below })
    this.placePins(g)
    requestAnimationFrame(() => { el.dataset.on = ''; el.dataset.pop = ''; this.placePins(g) })
  }

  private start(): void {
    if (this.running) return
    this.running = true
    this.dirty = true
    const loop = () => {
      if (this.dirty) { this.dirty = false; this.draw() }
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  private stop(): void {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  private progress(): number {
    if (reduced()) return 1
    const { section, stick } = this.el
    const stuckAt = parseFloat(getComputedStyle(stick).top) || 0
    return clamp(-(section.getBoundingClientRect().top - stuckAt) / (section.offsetHeight - stick.offsetHeight), 0, 1)
  }

  private draw(): void {
    const { globe, unroll, el } = this
    if (!globe || !unroll) return
    const p = (this.p = this.progress())
    const still = reduced()
    // The hero's words and arcs fade as soon as the page starts to move.
    this.heroA = 1 - seg(p, 0, 0.05)
    el.pins.style.opacity = this.heroA.toFixed(3)
    const introA = 1 - seg(p, 0.01, 0.12)
    el.intro.style.opacity = still ? '' : introA.toFixed(3)
    el.intro.style.transform = still ? '' : `translateY(${(-36 * (1 - introA)).toFixed(1)}px)`
    for (const e of [el.legend, el.key]) e.style.opacity = still ? '' : introA.toFixed(3)
    el.front.style.pointerEvents = p > 0.02 && !still ? 'none' : ''
    el.front.toggleAttribute('inert', p > 0.3 && !still)
    el.cue.style.opacity = (1 - seg(p, 0, 0.04)).toFixed(2)
    if (!still) {
      if (p > 0 && !this.held) { this.held = true; globe.hold(true); globe.only = null; this.view.hot([]); this.showTip(null, 0, 0) }
      if (p === 0 && this.held) { this.held = false; unroll.reset(); globe.hold(false) }
    }
    const swapped = still || p >= P_SWAP
    el.globeCol.style.visibility = swapped && !still ? 'hidden' : ''
    el.map.style.visibility = swapped ? 'visible' : 'hidden'
    if (p < P_SWAP && p > 0) globe.draw()
    this.paneState(swapped ? unroll.draw(p, still) : 0)
  }

  private paneState(kT: number): void {
    this.kT = kT
    const still = reduced()
    this.el.lanes.toggleAttribute('data-on', kT > 0.5)
    Array.from(this.el.lanes.children).forEach((pane, i) => {
      if (!(pane instanceof HTMLElement)) return
      const a = seg(kT, i * 0.15, i * 0.15 + 0.6)
      pane.style.opacity = a.toFixed(3)
      pane.style.transform = still ? '' : `translateY(${((1 - ease(a)) * 24).toFixed(1)}px)`
      pane.style.visibility = a < 0.01 ? 'hidden' : 'visible'
    })
    if (kT > 0.5) this.countUp()
    if (kT > 0.6 && !this.wrote) {
      this.wrote = true
      const word = this.el.lanes.querySelector<HTMLElement>('[data-l="zh"] [data-word]')
      if (word) void writeWord(word)
    }
    if (kT < 0.1) { this.wrote = false; this.counted = false }
  }

  /** Each lane's figure counts up from zero once, in under a second. */
  private countUp(): void {
    if (this.counted) return
    this.counted = true
    this.el.lanes.querySelectorAll<HTMLElement>('[data-n]').forEach((b, i) => {
      const n = Number(b.dataset.n)
      if (reduced()) { b.textContent = String(n); return }
      const t0 = performance.now() + i * 120
      const step = (now: number) => {
        const t = clamp((now - t0) / 900, 0, 1)
        b.textContent = String(Math.round(n * (1 - Math.pow(1 - t, 3))))
        if (t < 1) requestAnimationFrame(step)
      }
      b.textContent = '0'
      requestAnimationFrame(step)
    })
  }
}
