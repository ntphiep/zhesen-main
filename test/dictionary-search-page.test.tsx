import { describe, it, expect, vi } from 'vitest'

// LookupPair does the real searching; here only the props the page hands it matter.
vi.mock('@/components/search/LookupPair', () => ({
  LookupPair: ({ initialQuery, lang }: { initialQuery: string; lang?: string }) =>
    <div data-testid="pair" data-query={initialQuery} data-lang={lang ?? ''} />,
}))

import { render, screen } from '@testing-library/react'
import Page from '@/app/dictionary/page'

async function renderPage(searchParams: Record<string, string>) {
  render(await Page({ searchParams: Promise.resolve(searchParams) }))
  return screen.getByTestId('pair')
}

describe('dictionary search page', () => {
  // `searchPath` appends the language because a chip for a related word already
  // knows which language it came from; reading only `q` would search all three
  // languages for a link that named just one.
  it('narrows the search to the language the link carried', async () => {
    const pair = await renderPage({ q: 'halibut', lang: 'en' })
    expect(pair.dataset.query).toBe('halibut')
    expect(pair.dataset.lang).toBe('en')
  })

  it('searches every language when no language is given', async () => {
    const pair = await renderPage({ q: 'holy' })
    expect(pair.dataset.lang).toBe('')
  })

  it('ignores a language that is not one of the three', async () => {
    const pair = await renderPage({ q: 'holy', lang: 'fr' })
    expect(pair.dataset.lang).toBe('')
  })
})
