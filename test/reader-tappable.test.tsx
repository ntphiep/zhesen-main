import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WordPopover } from '@/components/reader/WordPopover'
import { TappableText } from '@/components/reader/TappableText'
import type { DictEntryPreview, CharInfo } from '@/lib/dictionary/types'

// The add button reads the account, so the client stub carries a signed-in user.
// The stub is imported inside the factory because the factory runs before the
// module imports of this file settle.
vi.mock('@/lib/supabase/client', async () => {
  const { accountAuthStub } = await import('./helpers/supabase')
  return { createClient: () => accountAuthStub({ id: 'u1', email: 'a@b.com' }) }
})
vi.mock('@/lib/wordlist/store', () => ({
  addWord: vi.fn(async () => ({})),
  draftFromDictEntry: (e: { headword: string }) => ({ headword: e.headword }),
  isWordSaved: vi.fn(async () => false),
}))

const { resolveTokens, getZhSegmentCandidates, getCharacters } = vi.hoisted(() => ({
  resolveTokens: vi.fn(async () => new Map()),
  getZhSegmentCandidates: vi.fn(async () => [] as string[]),
  getCharacters: vi.fn(async () => [] as CharInfo[]),
}))
vi.mock('@/lib/dictionary/resolveTokens', () => ({ resolveTokens, getZhSegmentCandidates }))
vi.mock('@/lib/dictionary/entryDetail', () => ({ getCharacters }))

const dog: DictEntryPreview = {
  id: 'en:dog', lang: 'en', headword: 'dog', traditional: null, level: 'A1',
  ipa: '/dɔːɡ/', pos: 'noun', glossVi: 'con chó', glossEn: 'dog', audioUrl: null,
}

describe('WordPopover', () => {
  it('renders an entry with meaning, detail link and add button', async () => {
    render(<WordPopover entry={dog} />)
    expect(screen.getByText('con chó')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /chi tiết/i })).toHaveAttribute('href', '/dictionary/en/dog')
    // The button mounts only once the session read resolves.
    expect(await screen.findByRole('button', { name: /Thêm vào sổ tay/i })).toBeInTheDocument()
  })

  it('renders character info for the zh fallback', () => {
    const char: CharInfo = { char: '人', radical: '人', strokeCount: 2, hanViet: ['nhân'], pinyin: ['rén'], gloss: 'person' }
    render(<WordPopover charInfo={char} />)
    expect(screen.getByText('人')).toBeInTheDocument()
    expect(screen.getByText(/nhân/)).toBeInTheDocument()
    expect(screen.getByText(/rén/)).toBeInTheDocument()
  })
})

describe('TappableText', () => {
  it('makes matched words clickable and leaves others as plain text', async () => {
    resolveTokens.mockResolvedValueOnce(new Map([['dog', dog]]))
    render(<TappableText text="the dog" lang="en" />)
    const btn = await screen.findByRole('button', { name: 'dog' })
    expect(screen.queryByRole('button', { name: 'the' })).toBeNull()
    await userEvent.click(btn)
    expect(await screen.findByText('con chó')).toBeInTheDocument()
  })

  // Tapping the word again was the only way to dismiss the popover, so reading on
  // past it left it hanging over the rest of the sentence.
  it('closes the popover when Escape is pressed', async () => {
    resolveTokens.mockResolvedValueOnce(new Map([['dog', dog]]))
    render(<TappableText text="the dog" lang="en" />)
    await userEvent.click(await screen.findByRole('button', { name: 'dog' }))
    expect(await screen.findByText('con chó')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByText('con chó')).toBeNull()
  })

  it('closes the popover when the reader clicks elsewhere on the page', async () => {
    resolveTokens.mockResolvedValueOnce(new Map([['dog', dog]]))
    render(
      <div>
        <TappableText text="the dog" lang="en" />
        <p>đoạn văn khác</p>
      </div>,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'dog' }))
    expect(await screen.findByText('con chó')).toBeInTheDocument()
    await userEvent.click(screen.getByText('đoạn văn khác'))
    expect(screen.queryByText('con chó')).toBeNull()
  })

  // A short word measured 15.2 x 26 px against the 24 x 24 minimum. jsdom lays nothing
  // out, so only the class that draws the larger hit area can be asserted.
  it('gives a short word a hit area of at least 24 px without moving the text', async () => {
    resolveTokens.mockResolvedValueOnce(new Map([['dog', dog]]))
    render(<TappableText text="the dog" lang="en" />)
    const btn = await screen.findByRole('button', { name: 'dog' })
    expect(btn).toHaveClass('relative', 'before:absolute', 'before:min-w-6', 'before:min-h-6')
    expect(btn.className).not.toMatch(/(^|\s)(p|px|m|mx)-/)
  })

  it('keeps the popover open while the reader interacts with it', async () => {
    resolveTokens.mockResolvedValueOnce(new Map([['dog', dog]]))
    render(<TappableText text="the dog" lang="en" />)
    await userEvent.click(await screen.findByRole('button', { name: 'dog' }))
    await userEvent.click(await screen.findByText('con chó'))
    expect(screen.getByText('con chó')).toBeInTheDocument()
  })
})
