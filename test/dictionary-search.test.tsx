// test/dictionary-search.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DictionarySearch } from '@/app/dictionary/DictionarySearch'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/dictionary/search', () => ({
  searchEntries: vi.fn(async () => ([
    { id: 'en:dog', lang: 'en', headword: 'dog', traditional: null, level: 'A1', ipa: '/dɔːɡ/', pos: 'noun', glossVi: 'con chó', glossEn: 'dog', audioUrl: null },
  ])),
}))

describe('DictionarySearch', () => {
  it('searches and links each result to its detail page', async () => {
    render(<DictionarySearch initialQuery="" initialLang="en" />)
    await userEvent.type(screen.getByPlaceholderText(/Nhập từ/i), 'dog')
    const link = await screen.findByRole('link', { name: /dog/ })
    expect(link).toHaveAttribute('href', '/dictionary/en/dog')
    expect(screen.getByText('con chó')).toBeInTheDocument()
  })
})
