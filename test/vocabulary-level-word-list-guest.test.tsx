import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LevelWordList } from '@/components/vocabulary/LevelWordList'
import type { DictEntryPreview } from '@/lib/dictionary/types'
import type { Language } from '@/lib/languages'

// A browser with no session at all.
vi.mock('@/lib/supabase/client', async () => {
  const { accountAuthStub } = await import('./helpers/supabase')
  return { createClient: () => accountAuthStub(null) }
})

const en: Language = { code: 'en', name: 'Tiếng Anh', nativeName: 'English', script: 'latin' }

function entry(headword: string): DictEntryPreview {
  return {
    id: `en:${headword}`, lang: 'en', headword, traditional: null, level: 'A1',
    ipa: null, pos: null, glossVi: null, glossEn: null, audioUrl: null,
  }
}

describe('LevelWordList for a guest', () => {
  it('sends "add all" to /register and back to the page the guest is on', async () => {
    render(<LevelWordList language={en} level="A1" levelIsEstimated={false} initialItems={[entry('c')]} initialStart={2} total={4} pageSize={1} />)
    const link = await screen.findByRole('link', { name: /Thêm cả A1 vào sổ tay \(4 từ\)/ })
    expect(link).toHaveAttribute('href', `/register?next=${encodeURIComponent('/theory/en/vocabulary/A1?page=3')}`)
    expect(screen.queryByRole('button', { name: /Thêm cả A1/ })).not.toBeInTheDocument()
  })

  it('leaves page 1 without a page parameter', async () => {
    render(<LevelWordList language={en} level="A1" levelIsEstimated={false} initialItems={[entry('a')]} total={4} pageSize={1} />)
    const link = await screen.findByRole('link', { name: /Thêm cả A1/ })
    expect(link).toHaveAttribute('href', `/register?next=${encodeURIComponent('/theory/en/vocabulary/A1')}`)
  })
})
