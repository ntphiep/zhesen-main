import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DictEntryPreview } from '@/lib/dictionary/types'

const { user, addWords, listSavedEntryIds } = vi.hoisted(() => ({
  user: { current: { id: 'u1', email: 'a@b.com' } as { id: string; email: string } | null },
  addWords: vi.fn(),
  listSavedEntryIds: vi.fn(),
}))

vi.mock('@/lib/supabase/client', async () => {
  const { accountAuthStub } = await import('./helpers/supabase')
  return { createClient: () => accountAuthStub(user.current) }
})
vi.mock('@/lib/wordlist/store', async (orig) => ({ ...(await orig()), addWords, listSavedEntryIds }))

import { ToeicTopicSave } from '@/components/theory/ToeicTopicSave'
import { AddToWordlistButton } from '@/components/lookup/AddToWordlistButton'

function entry(headword: string, glossVi: string): DictEntryPreview {
  return {
    id: `en:${headword}`, lang: 'en', headword, traditional: null, level: 'B1',
    ipa: null, pos: 'noun', glossVi, glossEn: null, audioUrl: null,
  }
}

const words = [
  { entry: entry('branch', 'chi nhánh'), example: { text: 'Tom is branch manager.', vi: 'Tom là giám đốc chi nhánh.', byModel: false } },
  { entry: entry('agenda', 'chương trình họp'), example: null },
  { entry: entry('memo', 'thông báo nội bộ'), example: null },
]
const path = '/theory/en/toeic/topic/office'

beforeEach(() => {
  vi.clearAllMocks()
  user.current = { id: 'u1', email: 'a@b.com' }
})

describe('ToeicTopicSave', () => {
  it('sends a guest to /register and back to the topic', async () => {
    user.current = null
    render(<ToeicTopicSave lang="en" path={path} words={words} />)
    const link = await screen.findByRole('link', { name: /Lưu cả chủ đề vào sổ tay/ })
    expect(link).toHaveAttribute('href', `/register?next=${encodeURIComponent(path)}`)
  })

  it('saves the words not yet saved with the test meaning, the sentence and the TOEIC tag, then offers practice', async () => {
    listSavedEntryIds.mockResolvedValue(new Set(['en:memo']))
    addWords.mockImplementation(async (_s, drafts: unknown[]) => drafts)
    render(<ToeicTopicSave lang="en" path={path} words={words} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Lưu cả chủ đề vào sổ tay' }))
    expect(await screen.findByRole('button', { name: 'Đã lưu 2 từ' })).toBeDisabled()

    expect(listSavedEntryIds).toHaveBeenCalledWith(expect.anything(), 'en')
    const drafts = addWords.mock.calls[0][1]
    expect(drafts).toHaveLength(2)
    expect(drafts[0]).toMatchObject({
      entryId: 'en:branch', meaningVi: 'chi nhánh', example: 'Tom is branch manager.',
      exampleTranslation: 'Tom là giám đốc chi nhánh.', tags: ['toeic'],
    })
    expect(drafts[1]).toMatchObject({ entryId: 'en:agenda', meaningVi: 'chương trình họp', example: null, tags: ['toeic'] })

    expect(screen.getByRole('link', { name: /Luyện tập/ })).toHaveAttribute('href', '/practice?tag=toeic')
  })

  it('turns the save button of each word into Đã có trong sổ tay once the topic is saved', async () => {
    listSavedEntryIds.mockResolvedValue(new Set())
    addWords.mockImplementation(async (_s, drafts: unknown[]) => drafts)
    render(<><ToeicTopicSave lang="en" path={path} words={words} /><AddToWordlistButton entry={words[0].entry} /></>)
    expect(await screen.findByRole('button', { name: 'Thêm vào sổ tay' })).toBeEnabled()
    await userEvent.click(await screen.findByRole('button', { name: 'Lưu cả chủ đề vào sổ tay' }))
    expect(await screen.findByRole('button', { name: 'Đã có trong sổ tay' })).toBeDisabled()
  })

  it('says so when a save fails, and lets the learner try again', async () => {
    listSavedEntryIds.mockRejectedValueOnce(new Error('offline'))
    render(<ToeicTopicSave lang="en" path={path} words={words} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Lưu cả chủ đề vào sổ tay' }))
    expect(await screen.findByRole('button', { name: 'Chưa lưu được. Thử lại.' })).toBeEnabled()
    expect(screen.queryByRole('link', { name: /Luyện tập/ })).not.toBeInTheDocument()
  })
})
