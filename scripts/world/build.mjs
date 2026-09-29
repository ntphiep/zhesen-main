// Writes lib/home/world/: languages.json for the globe, stats.json for the landing page's facts,
// and NOTICE-CLDR.txt, the notice the Unicode License v3 asks to travel with a copy of its data.
// The four CLDR 48.2.0 files are fetched from jsDelivr and checked against the hashes below
// before use; the shapes come from the world-atlas package. Run: npm run world:build
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { buildLanguages, buildStats } from './worldData.ts'

const CDN = 'https://cdn.jsdelivr.net/npm'
const FILES = {
  info: [`${CDN}/cldr-core@48.2.0/supplemental/territoryInfo.json`, 'b50369a0e1f5434c942dfe45064b39f488604ca0cedac5117e993248c19f2c0a'],
  tree: [`${CDN}/cldr-core@48.2.0/supplemental/territoryContainment.json`, '9f7d2eed5278ebb7c302b7536e391708b237945c314d09a206c632c2fab45ee2'],
  codes: [`${CDN}/cldr-core@48.2.0/supplemental/codeMappings.json`, '0d1ef50b92c1140e5847d22d96faf1a9c35543b0dedf8e9a2fcb87e4c51b9ed6'],
  names: [`${CDN}/cldr-localenames-full@48.2.0/main/vi/territories.json`, '1bf0ad4f7286b12b326f9d4387af6d4bcc4e1099a269c2ec9a6c9e5d6db20476'],
  licence: [`${CDN}/cldr-core@48.2.0/LICENSE`, 'b49d0e9f8ead51ca8b7df6fec89cc3ae6809198b4b9d43c74216da0118f23f5b'],
}

async function get(key) {
  const [url, sha] = FILES[key]
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  const body = Buffer.from(await res.arrayBuffer())
  const got = createHash('sha256').update(body).digest('hex')
  if (got !== sha) throw new Error(`${url}: sha256 ${got}, expected ${sha}`)
  return body.toString('utf8')
}

const [info, tree, codes, names, licence] = await Promise.all(Object.keys(FILES).map(get))
const atlas = (name) => JSON.parse(readFileSync(new URL(`../../node_modules/world-atlas/${name}`, import.meta.url), 'utf8'))

const territoryInfo = JSON.parse(info).supplemental.territoryInfo
const languages = buildLanguages(
  territoryInfo,
  JSON.parse(codes).supplemental.codeMappings,
  JSON.parse(names).main.vi.localeDisplayNames.territories,
  atlas('countries-110m.json'),
  atlas('countries-50m.json'),
)
const stats = buildStats(territoryInfo, JSON.parse(tree).supplemental.territoryContainment)

const out = new URL('../../lib/home/world/', import.meta.url)
mkdirSync(out, { recursive: true })
writeFileSync(new URL('languages.json', out), JSON.stringify(languages) + '\n')
writeFileSync(new URL('stats.json', out), JSON.stringify(stats, null, 2) + '\n')
writeFileSync(new URL('NOTICE-CLDR.txt', out),
  'lib/home/world/languages.json and stats.json are derived from the Unicode CLDR 48.2.0 data files\n' +
  'territoryInfo, territoryContainment, codeMappings and the Vietnamese territory names.\n\n' + licence)
console.log('countries', Object.keys(languages.countries).length, 'marks', languages.marks.length)
console.log(JSON.stringify(stats))
