import { feature, mesh } from 'topojson-client'
import type { Feature, Geometry, MultiLineString } from 'geojson'
import { z } from '@/lib/zod'
import type { Lang } from './motion'

/** The world the globe draws: world-atlas 110m shapes (Natural Earth), and which of them
 *  speak en, zh and es from lib/home/world/languages.json (scripts/world/build.mjs). Loaded
 *  through `import()` only, so neither file reaches a page that draws no globe. */

export const LANG_ORDER: readonly Lang[] = ['en', 'zh', 'es']
export const VIETNAM = '704'

const reach = z.enum(['strong', 'official'])
const countryRow = z.object({
  a2: z.string(),
  vi: z.string(),
  langs: z.object({ en: reach.optional(), zh: reach.optional(), es: reach.optional() }),
  hant: z.literal(true).optional(),
})
const languages = z.object({
  countries: z.record(z.string(), countryRow),
  marks: z.array(countryRow.extend({ at: z.tuple([z.number(), z.number()]) })),
})
export type CountryInfo = z.infer<typeof countryRow>
export type Mark = z.infer<typeof languages>['marks'][number]

// Only what `feature` and `mesh` read; the atlas's `land` object is dropped by the parse.
const polygon = z.object({ type: z.literal('Polygon'), id: z.string().optional(), arcs: z.array(z.array(z.number())) })
const multiPolygon = z.object({ type: z.literal('MultiPolygon'), id: z.string().optional(), arcs: z.array(z.array(z.array(z.number()))) })
const atlas = z.object({
  type: z.literal('Topology'),
  transform: z.object({ scale: z.tuple([z.number(), z.number()]), translate: z.tuple([z.number(), z.number()]) }),
  arcs: z.array(z.array(z.array(z.number()))),
  objects: z.object({
    countries: z.object({ type: z.literal('GeometryCollection'), geometries: z.array(z.discriminatedUnion('type', [polygon, multiPolygon])) }),
  }),
})

export interface Country {
  id: string
  shape: Feature<Geometry>
  info: CountryInfo | null
}

export interface World {
  countries: Country[]
  borders: MultiLineString
  marks: Mark[]
}

export async function loadWorld(): Promise<World> {
  const [topoModule, langModule] = await Promise.all([
    import('world-atlas/countries-110m.json'),
    import('@/lib/home/world/languages.json'),
  ])
  const topo = atlas.parse(topoModule.default)
  const langs = languages.parse(langModule.default)
  const collection = feature(topo, topo.objects.countries)
  const countries = collection.features
    .map((f) => ({ id: String(f.id ?? ''), shape: f, info: langs.countries[String(f.id ?? '')] ?? null }))
    // Antarctica would become a band across the whole bottom of the flat map.
    .filter((c) => c.id !== '010')
  const borders = mesh(topo, topo.objects.countries, (a, b) => a !== b)
  return { countries, borders, marks: langs.marks }
}
