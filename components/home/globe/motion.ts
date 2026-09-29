/** Numbers and easing the hero scene needs before the globe's own chunk has loaded. No
 *  imports, so the page bundle can take these without d3. */

export type LatLon = [number, number]
export type Lang = 'en' | 'zh' | 'es'

export const HANOI: LatLon = [105.85, 21.03]
/** Scroll progress at which the flat map takes over from the hero globe. */
export const P_SWAP = 0.06

export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a), 0, 1)

/** Where the looked-up word lands: Hà Nội to Beijing, then to Madrid and London, then on
 *  to Mexico City and New York, the view turning to each leg first. */
export const PLACES = {
  bj: { at: [116.4, 39.9], city: 'Bắc Kinh', below: false },
  md: { at: [-3.7, 40.42], city: 'Madrid', below: true },
  ld: { at: [-0.13, 51.5], city: 'London', below: false },
  mx: { at: [-99.13, 19.43], city: 'Mexico', below: true },
  ny: { at: [-74.0, 40.71], city: 'New York', below: false },
  hn: { at: HANOI, city: 'Hà Nội', below: false },
} satisfies Record<string, { at: LatLon; city: string; below: boolean }>
export type Place = keyof typeof PLACES

export const LEGS: { view: LatLon; hops: { lang: Lang; from: Place; to: Place }[] }[] = [
  { view: [111, 22], hops: [{ lang: 'zh', from: 'hn', to: 'bj' }] },
  { view: [52, 32], hops: [{ lang: 'es', from: 'hn', to: 'md' }, { lang: 'en', from: 'hn', to: 'ld' }] },
  { view: [-42, 28], hops: [{ lang: 'es', from: 'md', to: 'mx' }, { lang: 'en', from: 'ld', to: 'ny' }] },
]
/** Where a legend chip turns the globe to. */
export const ANCHOR: Record<Lang, LatLon> = { en: [-40, 38], zh: [110, 30], es: [-62, 5] }
