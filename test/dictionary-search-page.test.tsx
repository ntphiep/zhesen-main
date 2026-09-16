import { describe, it, expect, vi } from 'vitest'

// SearchBox does the real searching; here only the props the page hands it matter.
vi.mock('@/components/search/SearchBox', () => ({
  SearchBox: ({ initialQuery, lang }: { initialQuery: string; lang?: string }) =>
    <div data-testid="box" data-query={initialQuery} data-lang={lang ?? ''} />,
}))

import { render, screen } from '@testing-library/react'
import Page from '@/app/dictionary/page'

async function renderPage(searchParams: Record<string, string>) {
  render(await Page({ searchParams: Promise.resolve(searchParams) }))
  return screen.getByTestId('box')
}

describe('dictionary search page', () => {
  // `searchPath` appends the language because a chip for a related word already
  // knows which language it came from. The page used to read only `q`, so clicking
  // "halibut" from an English entry searched Chinese and Spanish as well.
  it('narrows the search to the language the link carried', async () => {
    const box = await renderPage({ q: 'halibut', lang: 'en' })
    expect(box.dataset.query).toBe('halibut')
    expect(box.dataset.lang).toBe('en')
  })

  it('searches every language when no language is given', async () => {
    const box = await renderPage({ q: 'holy' })
    expect(box.dataset.lang).toBe('')
  })

  it('ignores a language that is not one of the three', async () => {
    const box = await renderPage({ q: 'holy', lang: 'fr' })
    expect(box.dataset.lang).toBe('')
  })
})
