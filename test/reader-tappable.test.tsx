import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WordPopover } from '@/components/reader/WordPopover'
import { TappableText } from '@/components/reader/TappableText'
import type { DictEntryPreview, CharInfo } from '@/lib/dictionary/types'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/wordlist/store', () => ({
  addWord: vi.fn(async () => ({})),
  draftFromDictEntry: (e: { headword: string }) => ({ headword: e.headword }),
}))

const { resolveTokens, getHeadwords, getCharacters } = vi.hoisted(() => ({
  resolveTokens: vi.fn(async () => new Map()),
  getHeadwords: vi.fn(async () => [] as string[]),
  getCharacters: vi.fn(async () => [] as CharInfo[]),
}))
vi.mock('@/lib/dictionary/search', () => ({ resolveTokens, getHeadwords, getCharacters }))

const dog: DictEntryPreview = {
  id: 'en:dog', lang: 'en', headword: 'dog', traditional: null, level: 'A1',
  ipa: '/dɔːɡ/', pos: 'noun', glossVi: 'con chó', glossEn: 'dog', audioUrl: null,
}

describe('WordPopover', () => {
  it('renders an entry with meaning, detail link and add button', () => {
    render(<WordPopover entry={dog} />)
    expect(screen.getByText('con chó')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /chi tiết/i })).toHaveAttribute('href', '/dictionary/en/dog')
    expect(screen.getByRole('button', { name: /Thêm vào sổ tay/i })).toBeInTheDocument()
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
})
