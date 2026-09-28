import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/dictionary/cached', () => ({
  getCachedCommonWords: vi.fn(),
  getCachedLevelsForLanguage: vi.fn(),
}))
vi.mock('@/lib/grammar/cached', () => ({ getCachedGrammarPointsByLang: vi.fn() }))

import * as theoryHub from '@/app/theory/[lang]/page'
import * as vocabularyHub from '@/app/theory/[lang]/vocabulary/page'

// Both hubs read lex.count_entries_by_level. Prerendered at build, the build failed
// whenever the anon role's 3 s statement timeout fired (#28).
describe('theory hubs that read the level counts', () => {
  it.each([
    ['/theory/[lang]', theoryHub],
    ['/theory/[lang]/vocabulary', vocabularyHub],
  ])('%s prerenders nothing at build and keeps its route cache window', (_, page) => {
    expect(page.generateStaticParams()).toEqual([])
    expect(page.revalidate).toBe(604800)
  })
})
