import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, within } from '@testing-library/react'
import { LookupView } from '@/components/lookup/LookupView'
import { wordLayout } from '@/lib/dictionary/wordLayout'
import type { DictEntryDetail, DictExample, DictSense } from '@/lib/dictionary/types'

vi.mock('@/lib/supabase/client', async () => {
  const { accountAuthStub } = await import('./helpers/supabase')
  return { createClient: () => accountAuthStub({ id: 'u1', email: 'a@b.com' }) }
})
vi.mock('@/lib/wordlist/store', () => ({
  addWord: vi.fn(async () => ({})),
  draftFromDictEntry: (e: { headword: string }) => ({ headword: e.headword }),
  isWordSaved: vi.fn(async () => false),
}))
vi.mock('@/lib/ai/browser', () => ({ callAi: vi.fn(), aiEnabled: vi.fn(async () => false) }))

const sense = (n: number, glossVi: string | null, glossEn: string, extra: Partial<DictSense> = {}): DictSense =>
  ({ pos: 'verb', glossVi, glossEn, senseOrder: n, id: `en:give up#${n}`, ...extra })

const entry = (over: Partial<DictEntryDetail>): DictEntryDetail => ({
  id: 'en:give up', lang: 'en', headword: 'give up', traditional: null, level: null, ipa: null, pos: 'verb',
  glossVi: null, glossEn: null, audioUrl: null, senses: [], pronunciations: [], examples: [], relations: [],
  attributes: {}, senseLinks: [], ...over,
})

beforeEach(() => {
  localStorage.clear()
  wordLayout.reset()
  delete document.documentElement.dataset.wordLayout
})

describe('the overview examples', () => {
  // /dictionary/en/give up drew three untranslated sense sentences and hid the translated one.
  it('shows a translated sentence ahead of untranslated sense-linked ones', () => {
    const senses = [1, 2, 3].map((n) => sense(n, `nghĩa ${n}`, `sense ${n}`))
    const examples: DictExample[] = [
      ...[1, 2, 3].map((n) => ({ text: `They gave up plan ${n}.`, reading: null, translationVi: null, translationEn: null, senseId: `en:give up#${n}` })),
      { text: 'She gave up smoking.', reading: null, translationVi: 'Cô ấy đã bỏ thuốc.', translationEn: null, senseId: null },
    ]
    render(<LookupView detail={entry({ senses, examples })} characters={[]} siblings={[]} />)
    const card = document.getElementById('examples')!
    expect(within(card).getByText('Cô ấy đã bỏ thuốc.')).toBeInTheDocument()
  })
})
