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
    expect(m.twitter).toEqual({ card: 'summary' })
    expect(m.alternates).toEqual({ canonical: '/dictionary/en/take' })
  })

  it('sets noindex, follow only when asked', () => {
    expect(pageMetadata({ title: 't', description: 'd' }).robots).toBeUndefined()
    expect(pageMetadata({ title: 't', description: 'd', noindex: true }).robots).toEqual({ index: false, follow: true })
  })
})
