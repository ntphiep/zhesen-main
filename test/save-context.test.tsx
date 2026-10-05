import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { sentenceAt } from '@/lib/reader/sentence'
import { draftFromDictEntry } from '@/lib/wordlist/store'
import { TappableText } from '@/components/reader/TappableText'
import type { DictEntryPreview } from '@/lib/dictionary/types'

const { addWord } = vi.hoisted(() => ({ addWord: vi.fn(async () => ({})) }))
vi.mock('@/lib/supabase/client', async () => {
  const { accountAuthStub } = await import('./helpers/supabase')
  return { createClient: () => ({ ...accountAuthStub({ id: 'u1', email: 'a@b.com' }), from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }) }
})
vi.mock('@/lib/wordlist/store', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/wordlist/store')>(),
  addWord,
  isWordSaved: vi.fn(async () => false),
}))

const dog: DictEntryPreview = {
  id: 'en:dog', lang: 'en', headword: 'dog', traditional: null, level: 'A1',
  ipa: null, pos: 'noun', glossVi: 'con chó', glossEn: 'dog', audioUrl: null,
}

describe('sentenceAt', () => {
  const text = 'I like cats. "The dog barks at night!" She left.'
  it('cuts the sentence around a word, with its closing punctuation', () => {
    const at = text.indexOf('dog')
    expect(sentenceAt(text, at, at + 3)).toBe('The dog barks at night!"')
    expect(sentenceAt(text, 0, 1)).toBe('I like cats.')
  })

  it('reads Chinese sentence marks', () => {
    expect(sentenceAt('我饿了。我们吃饭吧！', 6, 8)).toBe('我们吃饭吧！')
  })

  it('refuses a sentence too long to be a flashcard example', () => {
    expect(sentenceAt('word '.repeat(80), 0, 4)).toBeNull()
  })
})

describe('draftFromDictEntry with the sentence it was met in', () => {
  // 433 of 488 saved words had no example: a preview carried none.
  it('stores the sentence and its Vietnamese as the example of a preview', () => {
    const d = draftFromDictEntry(dog, { text: 'The dog barks.', translationVi: 'Con chó sủa.' })
    expect(d).toMatchObject({ example: 'The dog barks.', exampleTranslation: 'Con chó sủa.' })
  })

  it('keeps a preview with no sentence free of an example', () => {
    expect(draftFromDictEntry(dog)).toMatchObject({ example: null, exampleTranslation: null })
  })
})

describe('TappableText save', () => {
  const resolved = (text: string) => ({
    text,
    segments: [...text.matchAll(/\p{L}+|[^\p{L}]+/gu)].map((m) => ({ text: m[0], word: /\p{L}/u.test(m[0]) })),
    entries: [['dog', dog]] as [string, DictEntryPreview][],
    chars: [],
  })

  it('saves a tapped word with its sentence, and the Vietnamese of a one-sentence text', async () => {
    const text = 'The dog barks.'
    render(<TappableText text={text} lang="en" resolved={resolved(text)} translation="Con chó sủa." />)
    await userEvent.click(screen.getByRole('button', { name: 'dog' }))
    await userEvent.click(await screen.findByRole('button', { name: /Thêm vào sổ tay/ }))
    expect(addWord).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      example: 'The dog barks.', exampleTranslation: 'Con chó sủa.',
    }))
  })

  it('keeps only the sentence of a longer passage, whose Vietnamese it cannot split', async () => {
    addWord.mockClear()
    const text = 'I like cats. The dog barks.'
    render(<TappableText text={text} lang="en" resolved={resolved(text)} translation="Tôi thích mèo. Con chó sủa." />)
    await userEvent.click(screen.getByRole('button', { name: 'dog' }))
    await userEvent.click(await screen.findByRole('button', { name: /Thêm vào sổ tay/ }))
    expect(addWord).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      example: 'The dog barks.', exampleTranslation: null,
    }))
  })
})
