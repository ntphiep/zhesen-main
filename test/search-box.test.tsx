import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchBox } from '@/components/search/SearchBox'

const preview = (id: string, lang: string, headword: string, glossVi: string) => ({
  id, lang, headword, traditional: null, level: null, ipa: null, pos: null, glossVi, glossEn: null, audioUrl: null,
})

const prefetch = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ prefetch }) }))

beforeEach(() => {
  prefetch.mockClear()
  vi.stubGlobal('fetch', vi.fn(async () => ({
    json: async () => ({ en: [preview('en:dog', 'en', 'dog', 'con chó')], zh: [], es: [] }),
  })))
})

describe('SearchBox', () => {
  it('queries the search route and links each result to its detail page', async () => {
    render(<SearchBox initialQuery="" />)
    await userEvent.type(screen.getByRole('textbox'), 'dog')
    const link = await screen.findByRole('link', { name: /dog/ })
    expect(link).toHaveAttribute('href', '/dictionary/en/dog')
    expect(screen.getByText('con chó')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalled()
  })

  it('prefetches a result route on hover', async () => {
    render(<SearchBox initialQuery="" />)
    await userEvent.type(screen.getByRole('textbox'), 'dog')
    const link = await screen.findByRole('link', { name: /dog/ })
    await userEvent.hover(link)
    expect(prefetch).toHaveBeenCalledWith('/dictionary/en/dog')
  })
})
