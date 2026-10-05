import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddWordDialog } from '@/components/wordlist/AddWordDialog'
import { EditWordDialog } from '@/components/wordlist/EditWordDialog'
import { WordDetail } from '@/components/wordlist/WordDetail'
import { parseUserWordRow, updateWord } from '@/lib/wordlist/store'
import { resetAiEnabledCache } from '@/lib/hooks/useAiEnabled'
import { callAi, aiEnabled } from '@/lib/ai/browser'
import type { UserWord } from '@/lib/wordlist/types'
import { clientReturning } from './helpers/supabase'

const fetchSearch = vi.hoisted(() => vi.fn())
vi.mock('@/lib/dictionary/searchClient', () => ({ fetchSearch }))
vi.mock('@/lib/ai/browser', () => ({ callAi: vi.fn(), aiEnabled: vi.fn() }))

const dog = { id: 'en:dog', lang: 'en', headword: 'dog', traditional: null, level: 'A1', ipa: '/dɔːɡ/', pos: 'noun', glossVi: 'con chó', glossEn: 'dog', audioUrl: null }
const found = (en: unknown[]) => fetchSearch.mockResolvedValue({ status: 'ok', data: { entries: { en, es: [], zh: [] }, suggestions: [] } })

const row = {
  id: 'id1', lang: 'en', entry_id: null, headword: 'gizmo', reading: null, ipa: null, pos: null,
  meaning_vi: 'đồ chơi', meaning_en: null, level: 'B1', example: 'A gizmo.', example_translation: 'Một món đồ.',
  audio_url: null, notes: null, status: 'new', tags: [], created_at: 'x', updated_at: 'x',
  fsrs_due_at: '2026-01-01T00:00:00Z', fsrs_lapses: 0,
}

const manual: UserWord = { ...parseUserWordRow(row), aiFields: ['meaningVi', 'example'] }

beforeEach(() => {
  vi.mocked(callAi).mockReset()
  vi.mocked(aiEnabled).mockReset().mockResolvedValue(true)
  resetAiEnabledCache()
  found([])
})

describe('the stored provenance', () => {
  it('reads the column names back as fields and ignores names it does not know', () => {
    expect(parseUserWordRow({ ...row, ai_fields: ['meaning_vi', 'example_translation', 'notes'] }).aiFields)
      .toEqual(['meaningVi', 'exampleTranslation'])
    expect(parseUserWordRow(row).aiFields).toBeUndefined()
  })

  it('writes the fields as column names', async () => {
    const update = vi.fn()
    const { client, builder } = clientReturning(row)
    update.mockReturnValue(builder)
    Object.assign(builder, { update })
    await updateWord(client, 'id1', { meaningVi: 'x', aiFields: ['exampleTranslation'] })
    expect(update).toHaveBeenCalledWith({ meaning_vi: 'x', ai_fields: ['example_translation'] })
  })
})

describe('adding a word by hand', () => {
  it('offers the dictionary entry when the headword has one', async () => {
    found([dog])
    const onAdd = vi.fn()
    render(<AddWordDialog open onClose={() => {}} onAdd={onAdd} />)
    await userEvent.click(screen.getByRole('tab', { name: /Thủ công/i }))
    await userEvent.type(screen.getByPlaceholderText('Ví dụ: dog'), 'Dog')
    await userEvent.click(await screen.findByRole('button', { name: 'Thêm từ từ điển' }))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ entryId: 'en:dog', meaningVi: 'con chó' }))
  })

  it('offers nothing for a word the dictionary only has inside another', async () => {
    found([{ ...dog, id: 'en:hotdog', headword: 'hotdog' }])
    render(<AddWordDialog open onClose={() => {}} onAdd={vi.fn()} />)
    await userEvent.click(screen.getByRole('tab', { name: /Thủ công/i }))
    await userEvent.type(screen.getByPlaceholderText('Ví dụ: dog'), 'dog')
    await vi.waitFor(() => expect(fetchSearch).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Thêm từ từ điển' })).toBeNull()
  })

  it('marks the fields the assistant filled, saves its level, and unmarks a field rewritten', async () => {
    vi.mocked(callAi).mockResolvedValue({
      status: 'ok',
      data: { meaningVi: 'đồ chơi', ipa: '', pos: 'noun', level: 'B1', example: 'A gizmo.', exampleVi: 'Một món đồ.' },
    })
    const onAdd = vi.fn()
    render(<AddWordDialog open onClose={() => {}} onAdd={onAdd} />)
    await userEvent.click(screen.getByRole('tab', { name: /Thủ công/i }))
    await userEvent.type(screen.getByPlaceholderText('Ví dụ: dog'), 'gizmo')
    await userEvent.click(await screen.findByRole('button', { name: /Điền bằng AI/i }))
    await screen.findByDisplayValue('A gizmo.')
    await userEvent.type(screen.getByPlaceholderText('noun, verb...'), 's')
    await userEvent.click(screen.getByRole('button', { name: /Lưu từ/i }))
    const draft = onAdd.mock.calls[0][0]
    expect(draft.level).toBe('B1')
    expect([...draft.aiFields].sort()).toEqual(['example', 'exampleTranslation', 'level', 'meaningVi'])
  })
})

describe('the notebook', () => {
  it('labels the fields the assistant wrote', () => {
    render(<WordDetail word={manual} />)
    expect(screen.getByText('đồ chơi').querySelector('[title="AI điền"]')).not.toBeNull()
    expect(screen.getByText('A gizmo.').querySelector('[title="AI điền"]')).not.toBeNull()
  })

  it('drops the mark of a field the learner edits', async () => {
    const onSave = vi.fn()
    render(<EditWordDialog word={manual} open onClose={() => {}} onSave={onSave} />)
    const meaning = screen.getByLabelText(/Nghĩa tiếng Việt/i)
    await userEvent.clear(meaning)
    await userEvent.type(meaning, 'món đồ lạ')
    await userEvent.click(screen.getByRole('button', { name: /Lưu/i }))
    expect(onSave).toHaveBeenCalledWith('id1', expect.objectContaining({ meaningVi: 'món đồ lạ', aiFields: ['example'] }))
  })
})

describe('changing the headword after a fill', () => {
  it('drops the level and the AI labels filled for the old headword', async () => {
    vi.mocked(callAi).mockResolvedValue({
      status: 'ok',
      data: { meaningVi: 'con chó', ipa: '', pos: '', level: 'A1', example: '', exampleVi: '' },
    })
    const onAdd = vi.fn()
    render(<AddWordDialog open onClose={() => {}} onAdd={onAdd} />)
    await userEvent.click(screen.getByRole('tab', { name: /Thủ công/i }))
    await userEvent.type(screen.getByPlaceholderText('Ví dụ: dog'), 'dog')
    await userEvent.click(await screen.findByRole('button', { name: /Điền bằng AI/i }))
    await screen.findByDisplayValue('con chó')
    await userEvent.clear(screen.getByPlaceholderText('Ví dụ: dog'))
    await userEvent.type(screen.getByPlaceholderText('Ví dụ: dog'), 'ubiquitous')
    await userEvent.click(screen.getByRole('button', { name: /Lưu từ/i }))
    const draft = onAdd.mock.calls[0][0]
    expect(draft.level).toBeNull()
    expect(draft.aiFields).toBeUndefined()
  })
})
