import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AiTagButton } from '@/components/wordlist/AiTagButton'
import { AddWordDialog } from '@/components/wordlist/AddWordDialog'
import { WordDetail, resetDetailCache } from '@/components/wordlist/WordDetail'
import { resetAiEnabledCache } from '@/lib/hooks/useAiEnabled'
import { callAi, aiEnabled } from '@/lib/ai/browser'
import type { UserWord } from '@/lib/wordlist/types'

vi.mock('@/lib/ai/browser', () => ({ callAi: vi.fn(), aiEnabled: vi.fn() }))
vi.mock('@/lib/dictionary/searchClient', () => ({
  fetchSearch: vi.fn(async () => ({ status: 'ok', data: { entries: { en: [], es: [], zh: [] }, suggestions: [] } })),
}))

function mk(headword: string): UserWord {
  return {
    id: `en:${headword}`, lang: 'en', entryId: null, headword, reading: null, ipa: null, pos: null,
    meaningVi: `nghĩa của ${headword}`, meaningEn: null, level: null, example: null,
    exampleTranslation: null, audioUrl: null, notes: null, status: 'new', tags: [],
    createdAt: '2026-06-19T00:00:00Z', updatedAt: '2026-06-19T00:00:00Z', fsrsDueAt: '2026-01-01T00:00:00Z', fsrsLapses: 0,
  }
}

beforeEach(() => {
  vi.mocked(callAi).mockReset()
  vi.mocked(aiEnabled).mockReset().mockResolvedValue(true)
  resetAiEnabledCache()
  resetDetailCache()
})

describe('the tagger', () => {
  it('shows a failure that throws instead of going quiet', async () => {
    vi.mocked(callAi).mockRejectedValue(new Error('chunk load failed'))
    render(<AiTagButton words={[mk('invoice')]} existingTags={[]} onTagged={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Gắn thẻ bằng AI' }))
    expect(await screen.findByText('Chưa gắn được thẻ. Thử lại.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gắn thẻ bằng AI' })).toBeEnabled()
  })

  it('counts the words it could not tag', async () => {
    vi.mocked(callAi).mockResolvedValue({ status: 'ok', data: { tags: [{ headword: 'invoice', tags: ['kế toán'] }] } })
    const onTagged = vi.fn()
    render(<AiTagButton words={[mk('invoice'), mk('ledger')]} existingTags={[]} onTagged={onTagged} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Gắn thẻ bằng AI' }))
    expect(await screen.findByText('1 từ chưa có thẻ.')).toBeInTheDocument()
    expect(onTagged).toHaveBeenCalledWith(new Map([['en:invoice', ['kế toán']]]))
  })

  it('shows progress and stops after the round in flight, keeping it', async () => {
    const words = Array.from({ length: 45 }, (_, i) => mk(`w${i}`))
    let answer: (v: Awaited<ReturnType<typeof callAi>>) => void = () => {}
    vi.mocked(callAi).mockImplementation(() => new Promise((r) => { answer = r }))
    const onTagged = vi.fn()
    render(<AiTagButton words={words} existingTags={[]} onTagged={onTagged} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Gắn thẻ bằng AI' }))
    expect(screen.getByRole('button', { name: 'Đang gắn thẻ 0/45' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Dừng' }))
    answer({ status: 'ok', data: { tags: [{ headword: 'w0', tags: ['công sở'] }] } })
    expect(await screen.findByText('44 từ chưa có thẻ.')).toBeInTheDocument()
    expect(callAi).toHaveBeenCalledTimes(1)
    expect(onTagged).toHaveBeenCalledWith(new Map([['en:w0', ['công sở']]]))
  })
})

describe('filling a word by hand', () => {
  it('shows a failure that throws instead of going quiet', async () => {
    vi.mocked(callAi).mockRejectedValue(new Error('chunk load failed'))
    render(<AddWordDialog open onClose={() => {}} onAdd={vi.fn()} />)
    await userEvent.click(screen.getByRole('tab', { name: /Thủ công/i }))
    await userEvent.type(screen.getByPlaceholderText('Ví dụ: dog'), 'dog')
    await userEvent.click(await screen.findByRole('button', { name: /Điền bằng AI/i }))
    expect(await screen.findByText('Chưa điền được. Thử lại.')).toBeInTheDocument()
  })
})

describe('the notebook coach', () => {
  const answer = { mnemonic: 'invoice: in vào ô', collocations: [], examples: [], confusables: [] }

  it('sits under the AI label and keeps the mnemonic in the notes', async () => {
    vi.mocked(callAi).mockResolvedValue({ status: 'ok', data: answer })
    const onSaveNote = vi.fn(async () => true)
    render(<WordDetail word={mk('invoice')} onSaveNote={onSaveNote} />)
    expect(await screen.findByRole('heading', { name: 'AI' })).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Hỏi AI về invoice' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Lưu vào ghi chú' }))
    expect(onSaveNote).toHaveBeenCalledWith('invoice: in vào ô')
    expect(await screen.findByText('Đã lưu vào ghi chú.')).toBeInTheDocument()
  })

  it('offers the save again when it did not land', async () => {
    vi.mocked(callAi).mockResolvedValue({ status: 'ok', data: answer })
    render(<WordDetail word={mk('invoice')} onSaveNote={async () => false} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Hỏi AI về invoice' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Lưu vào ghi chú' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu vào ghi chú' })).toBeEnabled())
    expect(screen.queryByText('Đã lưu vào ghi chú.')).toBeNull()
  })
})
