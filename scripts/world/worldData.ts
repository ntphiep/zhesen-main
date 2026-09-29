/**
 * Which countries speak English, Chinese and Spanish, and the facts the landing page states
 * about them, from Unicode CLDR 48.2.0 and the world-atlas shapes. Pure functions with no
 * imports, so `build.mjs` runs this file under Node's type stripping and the tests import it.
 *
 * A language counts in a territory when CLDR marks it official or de facto official there,
 * or when at least half the population speaks it; "strong" means at least half. CLDR's
 * `_populationPercent` is the share of people who can use the language.
 */

export const LANGS = ['en', 'zh', 'es'] as const
export type Lang = (typeof LANGS)[number]

export interface LanguagePopulation {
  _populationPercent?: string
  _officialStatus?: string
}
export interface Territory {
  _population?: string
  languagePopulation?: Record<string, LanguagePopulation>
}
export type TerritoryInfo = Record<string, Territory>
export type Containment = Record<string, { _contains?: string[] }>
export type CodeMappings = Record<string, { _numeric?: string }>
export type TerritoryNames = Record<string, string>

/** The parts of a TopoJSON topology the centroid decoder reads. */
export interface Atlas {
  transform: { scale: [number, number]; translate: [number, number] }
  arcs: [number, number][][]
  objects: { countries: { geometries: { id?: string; type: string; arcs: unknown }[] } }
}

export type Reach = 'strong' | 'official'
export interface CountryRow {
  a2: string
  vi: string
  langs: Partial<Record<Lang, Reach>>
  /** Chinese is official here in traditional characters (Taiwan, Hong Kong, Macao). */
  hant?: true
}
export interface MarkRow extends CountryRow {
  at: [number, number]
}
export interface Languages {
  /** Keyed by the ISO numeric code, which is the id of a world-atlas shape. */
  countries: Record<string, CountryRow>
  /** Territories too small for the 110m atlas, placed at a centroid from the 50m one. */
  marks: MarkRow[]
}

export interface WorldStats {
  en: { official: number; continents: number; worldPercent: number }
  zh: { vnTimes: number }
  es: { latamCountries: number; latamCountriesPercent: number; americas: { percent: number } }
}

const OFFICIAL = new Set(['official', 'de_facto_official'])
/** The six inhabited continents as CLDR's containment tree names them. */
const CONTINENTS = ['002', '150', '142', '009', '003', '005']
const LATIN_AMERICA = '419'
const AMERICAS = '019'

/** zh_Hant is CLDR's separate row for Chinese written in traditional characters. */
const tagsOf = (l: Lang) => (l === 'zh' ? ['zh', 'zh_Hant'] : [l])
const round1 = (x: number) => Math.round(x * 10) / 10

/** Leaf territories under a region code, following `_contains` through sub-regions. */
export function leaves(tree: Containment, code: string, out = new Set<string>()): Set<string> {
  const kids = tree[code]?._contains
  if (!kids) { out.add(code); return out }
  for (const c of kids) leaves(tree, c, out)
  return out
}

export function buildStats(info: TerritoryInfo, tree: Containment): WorldStats {
  const continentOf = new Map<string, string>()
  for (const c of CONTINENTS) for (const t of leaves(tree, c)) continentOf.set(t, c)
  const pop = (t: string) => Number(info[t]?._population ?? 0)
  const share = (t: string, l: Lang) => {
    const lp = info[t]?.languagePopulation ?? {}
    return Math.min(100, tagsOf(l).reduce((s, k) => s + Number(lp[k]?._populationPercent ?? 0), 0))
  }
  const official = (t: string, l: Lang) => {
    const lp = info[t]?.languagePopulation ?? {}
    return tagsOf(l).some((k) => OFFICIAL.has(lp[k]?._officialStatus ?? ''))
  }
  const all = Object.keys(info)
  const world = all.filter((t) => continentOf.has(t)).reduce((s, t) => s + pop(t), 0)
  const speakers = (l: Lang, set: Iterable<string> = all) => [...set].reduce((s, t) => s + pop(t) * share(t, l) / 100, 0)

  const enOfficial = all.filter((t) => official(t, 'en'))
  const americas = [...leaves(tree, AMERICAS)]
  // Puerto Rico is a territory, so it is left out of the count of countries.
  const latam = [...leaves(tree, LATIN_AMERICA)].filter((t) => official(t, 'es') && t !== 'PR')
  const latamPop = latam.reduce((s, t) => s + pop(t), 0)
  const americasPop = americas.reduce((s, t) => s + pop(t), 0)
  return {
    en: {
      official: enOfficial.length,
      continents: new Set(enOfficial.map((t) => continentOf.get(t)).filter(Boolean)).size,
      worldPercent: round1(speakers('en') / world * 100),
    },
    zh: { vnTimes: round1(speakers('zh') / pop('VN')) },
    es: {
      latamCountries: latam.length,
      latamCountriesPercent: round1(speakers('es', latam) / latamPop * 100),
      americas: { percent: round1(speakers('es', americas) / americasPop * 100) },
    },
  }
}

/** Centroid of the largest ring of a shape, decoded from its delta-encoded arcs. */
export function centroid(atlas: Atlas, id: string): [number, number] | null {
  const g = atlas.objects.countries.geometries.find((x) => x.id === id)
  if (!g) return null
  const { scale, translate } = atlas.transform
  const arc = (i: number): [number, number][] => {
    let x = 0, y = 0
    const pts = atlas.arcs[i < 0 ? ~i : i].map(([dx, dy]): [number, number] => {
      x += dx; y += dy
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]]
    })
    return i < 0 ? pts.reverse() : pts
  }
  const polygons = (g.type === 'Polygon' ? [g.arcs] : g.arcs) as number[][][]
  let best: [number, number][] = []
  for (const p of polygons) {
    const ring = p[0].flatMap(arc)
    if (ring.length > best.length) best = ring
  }
  if (!best.length) return null
  const mean = (k: 0 | 1) => Math.round(best.reduce((s, q) => s + q[k], 0) / best.length * 1000) / 1000
  return [mean(0), mean(1)]
}

export function buildLanguages(
  info: TerritoryInfo, codes: CodeMappings, names: TerritoryNames, small: Atlas, big: Atlas,
): Languages {
  const drawn = new Set(small.objects.countries.geometries.map((g) => g.id))
  const countries: Record<string, CountryRow> = {}
  const marks: MarkRow[] = []
  for (const [a2, t] of Object.entries(info)) {
    const num = codes[a2]?._numeric
    if (!num) continue
    const best: Partial<Record<Lang, number>> = {}
    let hant = false
    for (const [tag, p] of Object.entries(t.languagePopulation ?? {})) {
      const base = LANGS.find((l) => l === tag.split('_')[0])
      if (!base) continue
      const pct = Number(p._populationPercent ?? 0)
      const isOfficial = OFFICIAL.has(p._officialStatus ?? '')
      if (!isOfficial && pct < 50) continue
      if (tag === 'zh_Hant' && isOfficial) hant = true
      best[base] = Math.max(best[base] ?? 0, pct)
    }
    const langs: Partial<Record<Lang, Reach>> = {}
    for (const l of LANGS) if (best[l] !== undefined) langs[l] = (best[l] ?? 0) >= 50 ? 'strong' : 'official'
    if (!Object.keys(langs).length) continue
    const row: CountryRow = { a2, vi: names[`${a2}-alt-short`] ?? names[a2] ?? a2, langs }
    if (hant) row.hant = true
    if (drawn.has(num)) countries[num] = row
    else {
      const at = centroid(big, num)
      if (at) marks.push({ ...row, at })
    }
  }
  return { countries, marks }
}
