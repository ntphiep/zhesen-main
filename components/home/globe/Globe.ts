import { geoContains, geoDistance, geoGraticule10, geoInterpolate, geoOrthographic, geoPath, type GeoPath, type GeoProjection } from 'd3-geo'
import { clamp, ease, HANOI, type Lang, type LatLon } from './motion'
import { LANG_ORDER, VIETNAM, type CountryInfo, type World } from './world'

/** A 2D-canvas globe on d3-geo 3.1.1: orthographic, spins east at `spin` degrees a second,
 *  turns by drag, inertia and the arrow keys, and colours each country by the languages
 *  its CLDR row lists. One requestAnimationFrame loop drives it and sleeps when idle. */

export interface Hit { info: CountryInfo; at: LatLon; vn?: true }
export interface Projected { x: number; y: number; visible: boolean; alpha: number }
export interface GlobeOptions {
  center?: LatLon
  spin?: number
  onHover?: (hit: Hit | null, x: number, y: number) => void
  onTap?: (hit: Hit | null, x: number, y: number) => void
}
export interface Palette {
  ocean: string; land: string; border: string; rim: string; grat: string; vn: string; shade: string
  en: string; zh: string; es: string
}
type Layer = (ctx: CanvasRenderingContext2D, g: Globe) => void

const REDUCED = '(prefers-reduced-motion: reduce)'
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [8, 0], ArrowRight: [-8, 0], ArrowUp: [0, -6], ArrowDown: [0, 6] }

/** Reads the --g-* colours off an element, because a canvas cannot take a CSS variable. */
export function readPalette(el: Element): Palette {
  const cs = getComputedStyle(el)
  const v = (n: string) => cs.getPropertyValue(n).trim()
  return {
    ocean: v('--g-ocean'), land: v('--g-land'), border: v('--g-border'), rim: v('--g-rim'), grat: v('--g-grat'),
    vn: v('--g-vn'), shade: v('--g-shade'), en: v('--g-en'), zh: v('--g-zh'), es: v('--g-es'),
  }
}

export class Globe {
  readonly proj: GeoProjection = geoOrthographic().clipAngle(90).precision(0.4)
  rot: [number, number, number]
  lit: Record<Lang, number> = { en: 1, zh: 1, es: 1 }
  /** One language to show alone, or null. */
  only: Lang | null = null
  /** Drawn after the base map, and run after each drawn frame. */
  readonly layers: Layer[] = []
  readonly frameHooks: ((g: Globe) => void)[] = []
  /** The visitor pressed the pause control. */
  stopped = false
  /** A layer is running its own animation, so the loop keeps going. */
  animating = false
  w = 0
  h = 0
  dpr = 1

  private readonly ctx: CanvasRenderingContext2D
  private readonly path: GeoPath
  private readonly graticule = geoGraticule10()
  private readonly spinSpeed: number
  private readonly reducedQuery = matchMedia(REDUCED)
  private litTarget: Record<Lang, number> = { en: 1, zh: 1, es: 1 }
  private pausedUntil = 0
  private holds = 0
  private drag: { x: number; y: number } | null = null
  private vel: [number, number] = [0, 0]
  private visible = true
  private patterns = new Map<string, CanvasPattern>()
  private colors: Palette | null = null
  private tween: ((now: number) => void) | null = null
  private settle: ((done: boolean) => void) | null = null
  private last = 0
  private raf = 0
  private readonly cleanup: (() => void)[] = []

  constructor(private readonly canvas: HTMLCanvasElement, private readonly world: World, private readonly opts: GlobeOptions = {}) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    this.ctx = ctx
    this.path = geoPath(this.proj, ctx)
    const c = opts.center ?? HANOI
    this.rot = [-c[0], -c[1] + 4, 0]
    this.spinSpeed = opts.spin ?? 5
    this.resize()
    const ro = new ResizeObserver(() => { this.resize(); this.draw() })
    ro.observe(canvas)
    const io = new IntersectionObserver((e) => { this.visible = e[0].isIntersecting; if (this.visible) this.kick() })
    io.observe(canvas)
    const onVisibility = () => this.kick()
    document.addEventListener('visibilitychange', onVisibility)
    this.cleanup.push(() => ro.disconnect(), () => io.disconnect(), () => document.removeEventListener('visibilitychange', onVisibility))
    this.bindPointer()
    this.bindKeys()
    this.kick()
  }

  get reduced(): boolean { return this.reducedQuery.matches }

  destroy(): void {
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.settle?.(false)
    this.cleanup.forEach((f) => f())
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect()
    this.dpr = Math.min(2, devicePixelRatio || 1)
    this.w = r.width; this.h = r.height
    this.canvas.width = Math.round(r.width * this.dpr); this.canvas.height = Math.round(r.height * this.dpr)
    this.proj.translate([r.width / 2, r.height / 2]).scale(Math.min(r.width, r.height) / 2 - 2)
    this.patterns.clear()
    this.colors = null
  }

  palette(): Palette { return (this.colors ??= readPalette(this.canvas)) }
  themeChanged(): void { this.colors = null; this.patterns.clear(); this.draw() }

  /** Dots for a language that is official but spoken by under half the people; stripes for two. */
  private pattern(key: string, colors: [string, string], kind: 'dots' | 'stripes'): CanvasPattern | string {
    const hit = this.patterns.get(key)
    if (hit) return hit
    const s = Math.round(7 * this.dpr), c = document.createElement('canvas')
    c.width = s; c.height = s
    const x = c.getContext('2d')
    if (!x) return colors[0]
    if (kind === 'dots') {
      x.fillStyle = colors[1]; x.fillRect(0, 0, s, s)
      x.fillStyle = colors[0]; x.beginPath(); x.arc(s / 2, s / 2, s * 0.24, 0, 7); x.fill()
    } else {
      x.fillStyle = colors[0]; x.fillRect(0, 0, s, s)
      x.strokeStyle = colors[1]; x.lineWidth = s * 0.42
      x.beginPath(); x.moveTo(-s, s * 2); x.lineTo(s * 2, -s); x.moveTo(-s, s); x.lineTo(s, -s); x.moveTo(0, s * 2); x.lineTo(s * 2, 0); x.stroke()
    }
    const p = this.ctx.createPattern(c, 'repeat')
    if (!p) return colors[0]
    p.setTransform(new DOMMatrix().scale(1 / this.dpr))
    this.patterns.set(key, p)
    return p
  }

  /** Languages of a country that are currently drawn, in the fixed order. */
  shown(info: Pick<CountryInfo, 'langs'> | null): Lang[] {
    if (!info) return []
    return LANG_ORDER.filter((l) => info.langs[l] && (!this.only || this.only === l) && this.lit[l] > 0.01)
  }

  private fillFor(info: CountryInfo | null): CanvasPattern | string | null {
    const C = this.palette()
    const langs = this.shown(info)
    if (!info || !langs.length) return null
    if (langs.length > 1) return this.pattern(langs.join('+'), [C[langs[0]], C[langs[1]]], 'stripes')
    const l = langs[0]
    return info.langs[l] === 'strong' ? C[l] : this.pattern('dots-' + l, [C[l], C.land], 'dots')
  }

  center(): LatLon { return [-this.rot[0], -this.rot[1]] }
  isVisible(at: LatLon): boolean { return geoDistance(at, this.center()) < Math.PI / 2 - 0.03 }
  /** Labels fade out over the last 20 degrees before the limb instead of popping off. */
  private edge(at: LatLon): number { return clamp((Math.PI / 2 - geoDistance(at, this.center())) / 0.35, 0, 1) }
  project(at: LatLon): Projected {
    const p = this.proj(at) ?? [0, 0]
    const e = this.edge(at)
    return { x: p[0], y: p[1], visible: e > 0.02, alpha: e }
  }

  draw(): void {
    // A hidden canvas measures 0x0, which makes the radius negative and the gradient throw.
    if (this.w <= 0 || this.h <= 0) return
    const { ctx, proj, path } = this
    const C = this.palette()
    proj.rotate(this.rot)
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, this.w, this.h)
    ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = C.ocean; ctx.fill()
    ctx.beginPath(); path(this.graticule); ctx.strokeStyle = C.grat; ctx.lineWidth = 0.6; ctx.stroke()
    for (const f of this.world.countries) {
      ctx.beginPath(); path(f.shape)
      ctx.fillStyle = f.id === VIETNAM ? C.vn : C.land
      ctx.fill()
      const fill = f.id === VIETNAM ? null : this.fillFor(f.info)
      if (!fill) continue
      ctx.globalAlpha = Math.min(...this.shown(f.info).map((l) => this.lit[l]))
      ctx.fillStyle = fill; ctx.fill()
      ctx.globalAlpha = 1
    }
    ctx.beginPath(); path(this.world.borders); ctx.strokeStyle = C.border; ctx.lineWidth = 0.7; ctx.stroke()
    // Territories too small for the 110m atlas, such as Singapore and Hong Kong, as dots.
    for (const m of this.world.marks) {
      const langs = this.shown(m)
      const fill = this.fillFor(m)
      if (!fill || !this.isVisible(m.at)) continue
      const [x, y] = proj(m.at) ?? [0, 0]
      const r = langs.length > 1 ? 4.2 : 3
      ctx.globalAlpha = Math.min(...langs.map((l) => this.lit[l]))
      ctx.beginPath(); ctx.arc(x, y, r + 1.4, 0, 7); ctx.fillStyle = C.ocean; ctx.fill()
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = fill; ctx.fill()
      ctx.globalAlpha = 1
    }
    for (const fn of this.layers) fn(ctx, this)
    // A faint shade toward the rim, so the flat map still reads as a ball.
    const [tx, ty] = proj.translate(), R = proj.scale()
    const g = ctx.createRadialGradient(tx - R * 0.3, ty - R * 0.35, R * 0.1, tx, ty, R)
    g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(0.7, 'rgba(255,255,255,0)'); g.addColorStop(1, C.shade)
    ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = g; ctx.fill()
    ctx.beginPath(); path({ type: 'Sphere' }); ctx.strokeStyle = C.rim; ctx.lineWidth = 1.2; ctx.stroke()
    for (const fn of this.frameHooks) fn(this)
  }

  kick(): void {
    if (!this.raf && this.visible && !document.hidden) this.raf = requestAnimationFrame((t) => this.tick(t))
  }

  private tick(now: number): void {
    this.raf = 0
    const dt = this.last ? Math.min(64, now - this.last) : 16
    this.last = now
    let busy = false
    if (this.tween) { busy = true; this.tween(now) }
    else if (this.drag) busy = true
    else if (Math.hypot(this.vel[0], this.vel[1]) > 0.002) {
      this.rot[0] += this.vel[0] * dt; this.rot[1] = clamp(this.rot[1] + this.vel[1] * dt, -70, 70)
      const k = Math.exp(-dt / 420); this.vel[0] *= k; this.vel[1] *= k; busy = true
    } else if (!this.reduced && !this.stopped && !this.holds && now > this.pausedUntil && this.spinSpeed) {
      this.rot[0] += this.spinSpeed * dt / 1000; busy = true
    }
    for (const l of LANG_ORDER) {
      const d = this.litTarget[l] - this.lit[l]
      if (Math.abs(d) > 0.004) { this.lit[l] += d * (1 - Math.exp(-dt / (this.reduced ? 1 : 140))); busy = true }
      else this.lit[l] = this.litTarget[l]
    }
    if (this.animating) busy = true
    this.draw()
    if (busy && this.visible && !document.hidden) this.kick()
    else this.last = 0
  }

  setLit(map: Partial<Record<Lang, number>>): void {
    Object.assign(this.litTarget, map)
    if (this.reduced) Object.assign(this.lit, map)
    this.kick()
  }
  pause(ms: number): void { this.pausedUntil = Math.max(this.pausedUntil, performance.now() + ms) }
  /** One language alone, or all three with null. */
  showOnly(lang: Lang | null): void { this.only = lang; this.kick() }
  /** The pause control; returns whether the globe is now stopped. */
  toggleStopped(): boolean { this.stopped = !this.stopped; this.kick(); return this.stopped }
  hold(on: boolean): void {
    this.holds = Math.max(0, this.holds + (on ? 1 : -1))
    if (!on) this.pause(1200)
    this.kick()
  }

  /** Turn the view to a point along the shortest path. Resolves true on arrival, false when
   *  another turn or a drag took over. */
  rotateTo(at: LatLon, ms = 1000): Promise<boolean> {
    const from = this.center(), to: LatLon = [at[0], clamp(at[1], -60, 60)]
    this.vel = [0, 0]
    this.settle?.(false)
    this.settle = null
    if (this.reduced || ms === 0) { this.tween = null; this.rot = [-to[0], -to[1], 0]; this.kick(); return Promise.resolve(true) }
    const interp = geoInterpolate(from, to)
    const t0 = performance.now()
    const dur = Math.max(420, ms * Math.min(1, 0.35 + geoDistance(from, to) / 1.8))
    return new Promise((ok) => {
      this.settle = ok
      this.tween = (now) => {
        const t = clamp((now - t0) / dur, 0, 1)
        const c = interp(ease(t))
        this.rot = [-c[0], -c[1], 0]
        if (t >= 1) { this.tween = null; this.settle = null; ok(true) }
      }
      this.kick()
    })
  }

  /** A raised great-circle arc, drawn up to fraction t, with its far side hidden by the globe. */
  strokeArc(ctx: CanvasRenderingContext2D, a: LatLon, b: LatLon, t: number, color: string, width = 2): void {
    const interp = geoInterpolate(a, b), n = 64
    const [cx, cy] = this.proj.translate(), R = this.proj.scale()
    const span = geoDistance(a, b)
    const pts: { x: number; y: number; show: boolean }[] = []
    for (let i = 0; i <= n; i++) {
      const s = i / n, g = interp(s), [x, y] = this.proj(g) ?? [cx, cy]
      const h = 1 + 0.16 * Math.min(1, span / 0.9) * Math.sin(Math.PI * s)
      const px = cx + (x - cx) * h, py = cy + (y - cy) * h
      pts.push({ x: px, y: py, show: this.isVisible(g) || Math.hypot(px - cx, py - cy) > R })
    }
    const last = Math.floor(t * n)
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'
    ctx.beginPath()
    let pen = false
    for (let i = 0; i <= last; i++) {
      const p = pts[i]
      if (!p.show) { pen = false; continue }
      if (pen) ctx.lineTo(p.x, p.y); else { ctx.moveTo(p.x, p.y); pen = true }
    }
    ctx.stroke()
    const head = pts[last]
    if (head && head.show && t < 1) { ctx.beginPath(); ctx.arc(head.x, head.y, width + 1.6, 0, 7); ctx.fillStyle = color; ctx.fill() }
  }

  /** The country or small territory under a screen point, among those that speak a shown language. */
  pick(x: number, y: number): Hit | null {
    for (const m of this.world.marks) {
      if (!this.shown(m).length || !this.isVisible(m.at)) continue
      const [mx, my] = this.proj(m.at) ?? [-99, -99]
      if (Math.hypot(mx - x, my - y) < 9) return { info: m, at: m.at }
    }
    if (Math.hypot(x - this.w / 2, y - this.h / 2) > this.proj.scale()) return null
    const ll = this.proj.invert?.([x, y])
    if (!ll) return null
    for (const f of this.world.countries) {
      if (f.id === VIETNAM && geoContains(f.shape, ll)) return { info: { a2: 'VN', vi: 'Việt Nam', langs: {} }, at: ll, vn: true }
      if (!f.info || !this.shown(f.info).length) continue
      if (geoContains(f.shape, ll)) return { info: f.info, at: ll }
    }
    return null
  }

  private bindPointer(): void {
    const c = this.canvas
    c.style.touchAction = 'pan-y'
    let lastP: [number, number] = [0, 0], lastT = 0
    const local = (e: PointerEvent): [number, number] => {
      const r = c.getBoundingClientRect()
      return [e.clientX - r.left, e.clientY - r.top]
    }
    const down = (e: PointerEvent) => {
      this.drag = { x: e.clientX, y: e.clientY }; lastP = [e.clientX, e.clientY]; lastT = performance.now()
      this.vel = [0, 0]; this.tween = null; this.settle?.(false); this.settle = null
      c.setPointerCapture(e.pointerId); c.dataset.grabbing = ''; this.kick()
    }
    const move = (e: PointerEvent) => {
      if (this.drag) {
        const k = 57.3 / this.proj.scale() * 0.9
        const dx = e.clientX - lastP[0], dy = e.clientY - lastP[1], now = performance.now(), dt = Math.max(8, now - lastT)
        this.rot[0] += dx * k; this.rot[1] = clamp(this.rot[1] - dy * k, -70, 70)
        this.vel = [dx * k / dt, -dy * k / dt]
        lastP = [e.clientX, e.clientY]; lastT = now
        return
      }
      if (!this.opts.onHover || e.pointerType !== 'mouse') return
      const [x, y] = local(e)
      const hit = this.pick(x, y)
      c.style.cursor = hit ? 'pointer' : 'grab'
      this.opts.onHover(hit, x, y)
    }
    const end = (e: PointerEvent) => {
      if (!this.drag) return
      const moved = Math.hypot(e.clientX - this.drag.x, e.clientY - this.drag.y)
      this.drag = null; delete c.dataset.grabbing; this.pause(2200)
      if (performance.now() - lastT > 80) this.vel = [0, 0]
      if (moved < 4 && this.opts.onTap) { const [x, y] = local(e); this.opts.onTap(this.pick(x, y), x, y) }
      this.kick()
    }
    const leave = () => { if (this.opts.onHover && !this.drag) this.opts.onHover(null, 0, 0) }
    c.addEventListener('pointerdown', down)
    c.addEventListener('pointermove', move)
    c.addEventListener('pointerup', end)
    c.addEventListener('pointercancel', end)
    c.addEventListener('pointerleave', leave)
    this.cleanup.push(() => {
      c.removeEventListener('pointerdown', down); c.removeEventListener('pointermove', move)
      c.removeEventListener('pointerup', end); c.removeEventListener('pointercancel', end)
      c.removeEventListener('pointerleave', leave)
    })
  }

  /** Arrow keys turn the globe while it has focus. */
  private bindKeys(): void {
    const key = (e: KeyboardEvent) => {
      const d = ARROWS[e.key]
      if (!d) return
      e.preventDefault()
      const c = this.center()
      this.pause(3000)
      void this.rotateTo([c[0] - d[0], c[1] - d[1]], 320)
    }
    this.canvas.addEventListener('keydown', key)
    this.cleanup.push(() => this.canvas.removeEventListener('keydown', key))
  }
}
