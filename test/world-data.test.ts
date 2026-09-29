import { describe, it, expect } from 'vitest'
import { buildLanguages, buildStats, centroid, leaves, type Atlas, type Containment, type TerritoryInfo } from '@/scripts/world/worldData'
import stats from '@/lib/home/world/stats.json'

/** A CLDR in miniature: one continent holding two regions and four territories. */
const tree: Containment = {
  '002': { _contains: ['011', '014'] },
  '011': { _contains: ['AA', 'BB'] },
  '014': { _contains: ['CC', 'VN'] },
  '019': { _contains: ['419'] },
  '419': { _contains: ['CC', 'PR'] },
}
const info: TerritoryInfo = {
  AA: { _population: '100', languagePopulation: { en: { _populationPercent: '90', _officialStatus: 'official' } } },
  BB: { _population: '300', languagePopulation: { en: { _populationPercent: '10', _officialStatus: 'de_facto_official' }, zh: { _populationPercent: '60' } } },
  CC: { _population: '200', languagePopulation: { es: { _populationPercent: '80', _officialStatus: 'official' }, zh_Hant: { _populationPercent: '40', _officialStatus: 'official' } } },
  VN: { _population: '100', languagePopulation: { zh: { _populationPercent: '5' } } },
  PR: { _population: '50', languagePopulation: { es: { _populationPercent: '100', _officialStatus: 'official' } } },
}

describe('world facts from CLDR', () => {
  it('follows containment down to the leaf territories', () => {
    expect([...leaves(tree, '002')].sort()).toEqual(['AA', 'BB', 'CC', 'VN'])
  })

  it('counts official and de facto official, merges zh_Hant into zh and leaves Puerto Rico out of the countries', () => {
    const s = buildStats(info, tree)
    expect(s.en.official).toBe(2)
    // en speakers 90 + 30 = 120 of a world of 700 people (PR is under no continent).
    expect(s.en.worldPercent).toBe(17.1)
    // zh speakers 180 + 80 + 5 = 265, Viet Nam 100.
    expect(s.zh.vnTimes).toBe(2.7)
    expect(s.es.latamCountries).toBe(1)
    expect(s.es.latamCountriesPercent).toBe(80)
  })

  it('marks a language strong at half the population and places small territories at a centroid', () => {
    const codes = { AA: { _numeric: '001' }, BB: { _numeric: '002' }, CC: { _numeric: '003' } }
    const atlas = (ids: string[]): Atlas => ({
      transform: { scale: [1, 1], translate: [0, 0] },
      arcs: [[[0, 0], [2, 0], [0, 2], [-2, 0]]],
      objects: { countries: { geometries: ids.map((id) => ({ id, type: 'Polygon', arcs: [[0]] })) } },
    })
    const w = buildLanguages(info, codes, { CC: 'Xê Xê' }, atlas(['001', '002']), atlas(['003']))
    expect(w.countries['001'].langs).toEqual({ en: 'strong' })
    expect(w.countries['002'].langs).toEqual({ en: 'official', zh: 'strong' })
    expect(w.marks).toEqual([{ a2: 'CC', vi: 'Xê Xê', langs: { zh: 'official', es: 'strong' }, hant: true, at: [1, 1] }])
    expect(centroid(atlas(['003']), '009')).toBeNull()
  })

  it('writes the numbers the approved landing page states', () => {
    expect(stats).toEqual({
      en: { official: 91, continents: 6, worldPercent: 21.4 },
      zh: { vnTimes: 12.5 },
      es: { latamCountries: 18, latamCountriesPercent: 85.1, americas: { percent: 37.9 } },
    })
  })
})
