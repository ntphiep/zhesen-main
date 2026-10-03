import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { BreadcrumbJsonLd, TheoryBreadcrumb, breadcrumbList } from '@/components/seo/BreadcrumbJsonLd'
import { SITE_URL } from '@/lib/site'
import type { Language } from '@/lib/languages'

const en: Language = { code: 'en', name: 'Tiếng Anh', nativeName: 'English', script: 'latin' }

function jsonLd(container: HTMLElement): unknown {
  const script = container.querySelector('script[type="application/ld+json"]')
  return JSON.parse(script?.textContent ?? 'null')
}

describe('BreadcrumbList JSON-LD', () => {
  it('numbers the crumbs from 1, with absolute URLs and none on a last crumb without a path', () => {
    expect(breadcrumbList([{ name: 'Từ điển', path: '/dictionary' }, { name: 'take' }])).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Từ điển', item: `${SITE_URL}/dictionary` },
        { '@type': 'ListItem', position: 2, name: 'take' },
      ],
    })
  })

  it('escapes < so a name cannot close the script', () => {
    const { container } = render(<BreadcrumbJsonLd trail={[{ name: '</script><b>x' }]} />)
    const script = container.querySelector('script')
    expect(script?.innerHTML).not.toContain('</script>')
    expect(script?.innerHTML).toContain('\\u003c/script>')
    expect(jsonLd(container)).toMatchObject({ itemListElement: [{ name: '</script><b>x' }] })
  })

  it('walks a theory page from the hub through its language and block', () => {
    const { container } = render(<TheoryBreadcrumb language={en} block="vocabulary" leaf="A1" />)
    expect(jsonLd(container)).toMatchObject({
      itemListElement: [
        { position: 1, name: 'Lý thuyết', item: `${SITE_URL}/theory` },
        { position: 2, name: 'Tiếng Anh', item: `${SITE_URL}/theory/en` },
        { position: 3, name: 'Từ vựng', item: `${SITE_URL}/theory/en/vocabulary` },
        { position: 4, name: 'A1' },
      ],
    })
  })
})
