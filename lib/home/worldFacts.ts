import type { LangCode } from '@/lib/languages'
import type { WorldStats } from '@/scripts/world/worldData'

/** One fact per language on the landing page: a figure, its unit, a sentence for wide
 *  screens and a shorter one for a phone. */
export interface WorldFact {
  figure: number
  unit: string
  long: string
  short: string
}

const vi = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 })

/** A number as Vietnamese writes it: 1.234,5. */
export function viNumber(n: number): string {
  return vi.format(n)
}

/** The sentences round the counted numbers toward what is still true: 21.4% of the world
 *  is "1 in 5", 12.5 times is "more than 12", 85.1% is "more than 8 in 10". */
export function worldFacts(s: WorldStats): Record<LangCode, WorldFact> {
  const vnTimes = Math.floor(s.zh.vnTimes)
  return {
    en: {
      figure: s.en.continents,
      unit: 'châu lục',
      long: `Tiếng Anh là ngôn ngữ chính thức ở ${viNumber(s.en.official)} quốc gia và vùng lãnh thổ, trải khắp ${s.en.continents} châu lục có người ở. Cứ ${Math.ceil(100 / s.en.worldPercent)} người trên thế giới thì có 1 người nói được.`,
      short: `${viNumber(s.en.official)} quốc gia và vùng lãnh thổ dùng làm ngôn ngữ chính thức`,
    },
    zh: {
      figure: vnTimes,
      unit: 'lần dân số Việt Nam',
      long: `Người nói được tiếng Trung đông gấp hơn ${vnTimes} lần dân số Việt Nam. Gần như tất cả sống ở Trung Quốc, Đài Loan, Hồng Kông, Macao và Singapore.`,
      short: 'Gần như tất cả sống ở Trung Quốc, Đài Loan, Hồng Kông, Macao, Singapore',
    },
    es: {
      figure: s.es.latamCountries,
      unit: 'nước Mỹ Latinh',
      long: `Từ Mexico xuống tận Argentina, ${s.es.latamCountries} nước dùng tiếng Tây Ban Nha. Ở cả châu Mỹ, gần ${Math.ceil(s.es.americas.percent / 10)} trên 10 người nói được thứ tiếng này.`,
      short: `Ở ${s.es.latamCountries} nước ấy, cứ 10 người thì hơn ${Math.floor(s.es.latamCountriesPercent / 10)} người nói được`,
    },
  }
}
