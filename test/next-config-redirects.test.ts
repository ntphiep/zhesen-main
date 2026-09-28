import { describe, it, expect } from 'vitest'
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match'
import { prepareDestination } from 'next/dist/shared/lib/router/utils/prepare-destination'
import nextConfig from '@/next.config'

// The same matcher and destination builder Next's router applies to `redirects()`
// (next/dist/server/lib/router-utils/filesystem.js, resolve-routes.js), against the raw
// pathname, which keeps `%3A` encoded.
async function redirectOf(pathname: string): Promise<string | null> {
  for (const r of await nextConfig.redirects!()) {
    const params = getPathMatch(r.source, { strict: true, removeUnnamedParams: true })(pathname)
    if (!params) continue
    const { parsedDestination } = prepareDestination({ appendParamsToQuery: false, destination: r.destination, params, query: {} })
    return parsedDestination.pathname ?? null
  }
  return null
}

async function landsOn(pathname: string): Promise<string> {
  let at = pathname
  for (let hop = 0; hop < 5; hop += 1) {
    const next = await redirectOf(at)
    if (next === null) return at
    at = next
  }
  throw new Error(`redirect loop from ${pathname}`)
}

describe('grammar point redirects (#25)', () => {
  const NEW = '/theory/zh/grammar/hsk1_cau-vi-ngu-dong-tu'

  it('sends the colon form of an old URL to the colon-free one', async () => {
    expect(await landsOn('/theory/zh/grammar/hsk1:cau-vi-ngu-dong-tu')).toBe(NEW)
  })
  it('sends the percent-encoded form too, in either case', async () => {
    expect(await landsOn('/theory/zh/grammar/hsk1%3Acau-vi-ngu-dong-tu')).toBe(NEW)
    expect(await landsOn('/theory/zh/grammar/hsk1%3acau-vi-ngu-dong-tu')).toBe(NEW)
  })
  it('carries the pre-/theory URL all the way', async () => {
    expect(await landsOn('/grammar/zh/hsk1%3Acau-vi-ngu-dong-tu')).toBe(NEW)
    expect(await landsOn('/grammar/en/a1:cau-hoi-wh-questions')).toBe('/theory/en/grammar/a1_cau-hoi-wh-questions')
  })
  it('leaves the new URL and the overview alone', async () => {
    expect(await redirectOf(NEW)).toBeNull()
    expect(await redirectOf('/theory/zh/grammar')).toBeNull()
  })
})
