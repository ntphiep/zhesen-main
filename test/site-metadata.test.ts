import { describe, it, expect } from 'vitest'
import { pageMetadata } from '@/lib/site'

describe('pageMetadata', () => {
  // Next merges metadata shallowly: a page's openGraph replaces the layout's whole object.
  it('keeps the site-level Open Graph fields and the twitter card', () => {
    const m = pageMetadata({ title: 'take', description: 'd', canonical: '/dictionary/en/take' })
    expect(m.openGraph).toMatchObject({
      type: 'website', siteName: 'Zhesen', locale: 'vi_VN',
      title: 'take · Zhesen', description: 'd', url: '/dictionary/en/take',
    })
    expect(m.twitter).toEqual({ card: 'summary_large_image' })
    expect(m.alternates).toEqual({ canonical: '/dictionary/en/take' })
  })

  // Next attaches a segment's own opengraph-image only when its openGraph has no `images` key.
  it('names the site card unless the page draws its own', () => {
    const site = pageMetadata({ title: 't', description: 'd' }).openGraph
    expect(site).toMatchObject({ images: [{ url: '/opengraph-image', width: 1200, height: 630 }] })
    const own = pageMetadata({ title: 't', description: 'd', ownCard: true }).openGraph ?? {}
    expect(Object.hasOwn(own, 'images')).toBe(false)
  })

  it('sets noindex, follow only when asked', () => {
    expect(pageMetadata({ title: 't', description: 'd' }).robots).toBeUndefined()
    expect(pageMetadata({ title: 't', description: 'd', noindex: true }).robots).toEqual({ index: false, follow: true })
  })
})
