import { geoClipAntimeridian, geoClipCircle, geoDistance, geoEquirectangularRaw, geoGraticule10, geoOrthographicRaw, geoPath, geoProjection, type GeoRawProjection, type GeoStream } from 'd3-geo'
import { readPalette, type Globe, type Palette } from './Globe'
import { ease, lerp, P_SWAP, seg, type Lang } from './motion'
import { LANG_ORDER, VIETNAM, type Country, type World } from './world'

/** The scroll scene after the hero: the globe opens into a flat map, then each language's
 *  countries fly to the top of its lane (the right of its row on a phone) over a fill in
 *  the lane's colour. `draw(p)` paints scroll progress p and returns how far the lanes'
 *  text should have faded in. */

/** The flat map is centred on 25°E, so its edge runs through the open Pacific at 155°W. */
const END_LON = -25

/** Orthographic at t = 0, equirectangular at t = 1. */
const blend = (t: number): GeoRawProjection => (x, y) => {
  const a = geoOrthographicRaw(x, y), b = geoEquirectangularRaw(x, y)
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
}

interface Frame { cx: number; cy: number; R: number; lon: number; lat: number }
interface Group { feats: Country[]; k: number; tx: number; ty: number }
interface Colours extends Palette { bg: Record<Lang, string>; ink: Record<Lang, string> }

export class Unroll {
  private readonly ctx: CanvasRenderingContext2D
  private W = 0
  private H = 0
  private dpr = 1
  private colors: Colours | null = null
  private pats = new Map<string, CanvasPattern>()
  private groups: Record<Lang, Group> | null = null
  private from: Frame | null = null
  private readonly graticule = geoGraticule10()

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly world: World,
    private readonly globe: Globe,
    private readonly heroCanvas: HTMLCanvasElement,
    /** The bottom edge of a lane's heading, where its countries start. */
    private readonly laneTop: () => number,
    private readonly phone: () => boolean,
  ) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    this.ctx = ctx
  }

  /** Sizes the canvas and returns the height the lanes leave free for their countries. */
  resize(): number {
    const r = this.canvas.getBoundingClientRect()
    this.dpr = Math.min(2, devicePixelRatio || 1); this.W = r.width; this.H = r.height
    this.canvas.width = Math.round(this.W * this.dpr); this.canvas.height = Math.round(this.H * this.dpr)
    this.pats.clear(); this.groups = null; this.from = null
    return this.phone() ? 0 : Math.round(this.H * 0.3) + 30
  }

  /** Back at the top: the next unrolling starts from wherever the globe has turned to. */
  reset(): void { this.from = null }
  themeChanged(): void { this.colors = null; this.pats.clear() }

  private palette(): Colours {
    if (this.colors) return this.colors
    const cs = getComputedStyle(this.canvas), v = (n: string) => cs.getPropertyValue(n).trim()
    this.colors = {
      ...readPalette(this.canvas),
      bg: { en: v('--sea-700'), zh: v('--sea-600'), es: v('--sea-300') },
      ink: { en: '#fff', zh: '#fff', es: v('--sea-700') },
    }
    return this.colors
  }

  private dots(color: string, under: string): CanvasPattern | string {
    const key = color + under
    const hit = this.pats.get(key)
    if (hit) return hit
    const s = Math.round(7 * this.dpr), c = document.createElement('canvas'); c.width = s; c.height = s
    const x = c.getContext('2d')
    if (!x) return color
    x.fillStyle = under; x.fillRect(0, 0, s, s)
    x.fillStyle = color; x.beginPath(); x.arc(s / 2, s / 2, s * 0.24, 0, 7); x.fill()
    const pat = this.ctx.createPattern(c, 'repeat')
    if (!pat) return color
    pat.setTransform(new DOMMatrix().scale(1 / this.dpr))
    this.pats.set(key, pat)
    return pat
  }

  /** The unrolling starts exactly where the hero globe is drawn, with its rotation then. */
  private startFrame(): Frame {
    if (this.from) return this.from
    const c = this.heroCanvas.getBoundingClientRect(), s = this.canvas.getBoundingClientRect()
    this.from = { cx: c.left - s.left + c.width / 2, cy: c.top - s.top + c.height / 2, R: this.globe.proj.scale(), lon: this.globe.rot[0], lat: this.globe.rot[1] }
    return this.from
  }

  private projAt(t: number) {
    const g = this.startFrame()
    const s = Math.min(this.W / (2 * Math.PI), this.H * 0.8 / Math.PI)
    const dLon = ((END_LON - g.lon + 540) % 360) - 180
    const pr = geoProjection(blend(t))
    pr.scale(lerp(g.R, s, t)).translate([lerp(g.cx, this.W / 2, t), lerp(g.cy, this.H / 2, t)])
      .rotate([g.lon + dLon * ease(t), lerp(g.lat, 0, t), 0])
    // Cutting at the antimeridian as well stops a ring that crosses it (Alaska, Fiji) from streaking across the map.
    const circle = geoClipCircle(lerp(90, 179.5, t) * Math.PI / 180)
    const both = (sink: GeoStream) => circle(geoClipAntimeridian(sink))
    pr.preclip(t < 0.999 ? both : geoClipAntimeridian)
    return pr
  }

  private speaks(l: Lang): Country[] {
    return this.world.countries.filter((f) => f.info?.langs[l])
  }

  /** Where each language's countries end up. */
  private targets(): Record<Lang, Group> {
    if (this.groups) return this.groups
    const path = geoPath(this.projAt(1))
    const top = this.laneTop() - this.canvas.getBoundingClientRect().top
    const out: Partial<Record<Lang, Group>> = {}
    LANG_ORDER.forEach((l, i) => {
      const feats = this.speaks(l)
      const [[x0, y0], [x1, y1]] = path.bounds({ type: 'FeatureCollection', features: feats.map((f) => f.shape) })
      const { W, H } = this
      const box = this.phone()
        ? { x: W * 0.58, y: i * H / 3 + H * 0.035, w: W * 0.38, h: H / 3 - H * 0.07 }
        : { x: i * W / 3 + W * 0.025, y: top + 10, w: W / 3 - W * 0.05, h: H * 0.3 - 4 }
      const k = Math.min(box.w / (x1 - x0), box.h / (y1 - y0))
      out[l] = { feats, k, tx: box.x + (box.w - (x1 - x0) * k) / 2 - x0 * k, ty: box.y + (box.h - (y1 - y0) * k) / 2 - y0 * k }
    })
    this.groups = { en: out.en ?? this.empty(), zh: out.zh ?? this.empty(), es: out.es ?? this.empty() }
    return this.groups
  }
  private empty(): Group { return { feats: [], k: 1, tx: 0, ty: 0 } }

  draw(p: number, still: boolean): number {
    const { ctx, dpr, W, H, globe } = this
    const C = this.palette()
    const tM = still ? 1 : ease(seg(p, P_SWAP, 0.36))
    const kM = still ? 1 : ease(seg(p, 0.38, 0.64))
    const kB = still ? 1 : ease(seg(p, 0.5, 0.7))
    const kT = still ? 1 : seg(p, 0.64, 0.8)
    const pr = this.projAt(tM), path = geoPath(pr, ctx)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H)
    const phone = this.phone()

    if (kB > 0) LANG_ORDER.forEach((l, i) => {
      ctx.fillStyle = C.bg[l]
      if (phone) { const h = H / 3; ctx.fillRect(0, i * h + h * (1 - kB), W, h * kB + 0.5) }
      else { const w = W / 3; ctx.fillRect(i * w, H * (1 - kB), w + 0.5, H * kB) }
    })
    const fade = 1 - kM
    if (fade > 0.01) {
      ctx.globalAlpha = fade
      if (tM < 0.3) { ctx.globalAlpha = fade * (1 - tM / 0.3); ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = C.ocean; ctx.fill(); ctx.globalAlpha = fade }
      ctx.beginPath(); path(this.graticule); ctx.strokeStyle = C.grat; ctx.lineWidth = 0.6; ctx.stroke()
      for (const f of this.world.countries) { ctx.beginPath(); path(f.shape); ctx.fillStyle = f.id === VIETNAM ? C.vn : C.land; ctx.fill() }
      ctx.beginPath(); path(this.world.borders); ctx.strokeStyle = C.border; ctx.lineWidth = 0.6; ctx.stroke()
      ctx.globalAlpha = 1
    }
    const G = kM > 0 ? this.targets() : null
    for (const l of LANG_ORDER) {
      const feats = G ? G[l].feats : this.speaks(l)
      ctx.save()
      if (G) { const g = G[l], k = lerp(1, g.k, kM); ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * lerp(0, g.tx, kM), dpr * lerp(0, g.ty, kM)) }
      const onBg = kB > 0.6
      const color = onBg ? C.ink[l] : C[l], under = onBg ? C.bg[l] : C.land
      ctx.globalAlpha = globe.lit[l]
      for (const f of feats) { ctx.beginPath(); path(f.shape); ctx.fillStyle = f.info?.langs[l] === 'strong' ? color : this.dots(color, under); ctx.fill() }
      ctx.restore()
    }
    if (fade > 0.01) {
      // Singapore, Hong Kong and the other territories too small for the atlas, as dots.
      const from = this.startFrame()
      for (const m of this.world.marks) {
        const l = LANG_ORDER.find((x) => m.langs[x]); if (!l) continue
        const xy = pr(m.at)
        if (!xy || (tM < 0.5 && geoDistance(m.at, [-from.lon, -from.lat]) > Math.PI / 2 - 0.03)) continue
        ctx.globalAlpha = fade * globe.lit[l]
        ctx.beginPath(); ctx.arc(xy[0], xy[1], 3, 0, 7); ctx.fillStyle = C[l]; ctx.fill()
      }
      ctx.globalAlpha = 1
      if (tM < 0.3) {
        ctx.globalAlpha = 1 - tM / 0.3
        const [tx, ty] = pr.translate(), R = pr.scale()
        const g = ctx.createRadialGradient(tx - R * 0.3, ty - R * 0.35, R * 0.1, tx, ty, R)
        g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(0.7, 'rgba(255,255,255,0)'); g.addColorStop(1, C.shade)
        ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = g; ctx.fill()
        ctx.beginPath(); path({ type: 'Sphere' }); ctx.strokeStyle = C.rim; ctx.lineWidth = 1.2; ctx.stroke()
        ctx.globalAlpha = 1
      }
    }
    return kT
  }
}
