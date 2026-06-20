// test/lookup-view.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LookupView } from '@/components/lookup/LookupView'
import type { DictEntryDetail } from '@/lib/dictionary/types'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/wordlist/store', () => ({
  addWord: vi.fn(async () => ({})),
  draftFromDictEntry: (e: { headword: string }) => ({ headword: e.headword }),
}))

const base: DictEntryDetail = {
  id: 'en:dog', lang: 'en', headword: 'dog', traditional: null, level: 'A1', ipa: '/dɔːɡ/', pos: 'noun',
  glossVi: 'con chó', glossEn: 'dog', audioUrl: null,
  senses: [{ pos: 'noun', glossVi: 'con chó', glossEn: 'dog', senseOrder: 1 }],
  pronunciations: [], examples: [], relations: [], attributes: {},
}

describe('LookupView', () => {
  it('hides the character panel for non-zh entries', () => {
    render(<LookupView detail={base} characters={[]} siblings={[]} />)
    expect(screen.getByRole('heading', { name: 'dog' })).toBeInTheDocument()
    expect(screen.queryByText('Chữ và bộ thủ')).not.toBeInTheDocument()
  })
  it('shows the character panel for zh entries', () => {
    render(
      <LookupView
        detail={{ ...base, id: 'zh:狗', lang: 'zh', headword: '狗', attributes: { pinyin: 'gǒu' } }}
        characters={[{ char: '狗', radical: '犬', strokeCount: 8, hanViet: ['cẩu'], pinyin: ['gǒu'], gloss: 'dog' }]}
        siblings={[]}
      />,
    )
    expect(screen.getByText('Chữ và bộ thủ')).toBeInTheDocument()
  })
})
