import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddWordDialog } from '@/components/wordlist/AddWordDialog'
import { resetAiEnabledCache } from '@/lib/hooks/useAiEnabled'
import { callAi, aiEnabled } from '@/lib/ai/browser'

const dog = { id: 'en:dog', lang: 'en', headword: 'dog', traditional: null, level: 'A1', ipa: '/dɔːɡ/', pos: 'noun', glossVi: 'con chó', glossEn: 'dog', audioUrl: null }
const cat = { id: 'en:cat', lang: 'en', headword: 'cat', traditional: null, level: 'A1', ipa: '/kæt/', pos: 'noun', glossVi: 'con mèo', glossEn: 'cat', audioUrl: null }

const fetchSearch = vi.hoisted(() => vi.fn())
vi.mock('@/lib/dictionary/searchClient', () => ({ fetchSearch }))
vi.mock('@/lib/ai/browser', () => ({ callAi: vi.fn(), aiEnabled: vi.fn(async () => false) }))

function answer(forwardEn: unknown[], reverseEn: unknown[] = []) {
  fetchSearch.mockResolvedValue({
    status: 'ok',
    data: {
      forward: { en: forwardEn, es: [], zh: [] },
      reverse: { en: reverseEn, es: [], zh: [] },
      suggestions: [],
    },
  })
}

beforeEach(() => {
  vi.mocked(callAi).mockReset()
  vi.mocked(aiEnabled).mockReset().mockResolvedValue(false)
  resetAiEnabledCache()
  answer([dog])
})

describe('AddWordDialog', () => {
  it('searches and adds a dictionary entry', async () => {
    const onAdd = vi.fn()
    render(<AddWordDialog open onClose={() => {}} onAdd={onAdd} />)
    await userEvent.type(screen.getByPlaceholderText(/Tìm từ/i), 'dog')
    expect(await screen.findByText('con chó')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Thêm/i }))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ headword: 'dog', meaningVi: 'con chó', entryId: 'en:dog' }))
  })

  it('manual tab requires a headword', async () => {
    const onAdd = vi.fn()
    render(<AddWordDialog open onClose={() => {}} onAdd={onAdd} />)
    await userEvent.click(screen.getByRole('tab', { name: /Thủ công/i }))
    await userEvent.click(screen.getByRole('button', { name: /Lưu từ/i }))
    expect(onAdd).not.toHaveBeenCalled()
  })

  // The box read only `forward`, so typing the Vietnamese meaning -- the natural
  // move when you know what to save but not how it is spelled -- found nothing,
  // even though the route had already answered with it under `reverse`.
  it('finds a word typed as its Vietnamese meaning', async () => {
    answer([], [cat])
    render(<AddWordDialog open onClose={() => {}} onAdd={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText(/Tìm từ/i), 'con mèo')
    expect(await screen.findByText('cat')).toBeInTheDocument()
  })

  it('shows an entry once when both directions return it', async () => {
    answer([dog], [dog])
    render(<AddWordDialog open onClose={() => {}} onAdd={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText(/Tìm từ/i), 'dog')
    expect(await screen.findAllByText('dog')).toHaveLength(1)
  })

  // Adding a word already saved fails against the unique index from migration
  // 0031; saying so beforehand is better than letting the insert be refused.
  it('marks an entry already in the wordlist instead of offering it again', async () => {
    render(<AddWordDialog open onClose={() => {}} onAdd={vi.fn()} savedEntryIds={new Set(['en:dog'])} />)
    await userEvent.type(screen.getByPlaceholderText(/Tìm từ/i), 'dog')
    expect(await screen.findByText('Đã có')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Thêm$/ })).toBeNull()
  })

  it('hides the assistant when the deployment has no model configured', async () => {
    render(<AddWordDialog open onClose={() => {}} onAdd={vi.fn()} />)
    await userEvent.click(screen.getByRole('tab', { name: /Thủ công/i }))
    expect(screen.queryByRole('button', { name: /Điền bằng AI/i })).toBeNull()
  })

  it('fills the empty manual fields from the assistant and leaves typed ones alone', async () => {
    vi.mocked(aiEnabled).mockResolvedValue(true)
    vi.mocked(callAi).mockResolvedValue({
      status: 'ok',
      data: { meaningVi: 'con chó', ipa: 'dɔɡ', pos: 'noun', level: 'A1', example: 'The dog barked.', exampleVi: 'Con chó sủa.' },
    })
    const onAdd = vi.fn()
    render(<AddWordDialog open onClose={() => {}} onAdd={onAdd} />)
    await userEvent.click(screen.getByRole('tab', { name: /Thủ công/i }))
    await userEvent.type(screen.getByPlaceholderText('Ví dụ: dog'), 'dog')
    await userEvent.type(screen.getByPlaceholderText('con chó'), 'chó nhà')

    await userEvent.click(await screen.findByRole('button', { name: /Điền bằng AI/i }))
    await screen.findByDisplayValue('The dog barked.')

    // The learner's own wording outranks the model's.
    expect(screen.getByPlaceholderText('con chó')).toHaveValue('chó nhà')
    expect(screen.getByPlaceholderText('noun, verb...')).toHaveValue('noun')

    await userEvent.click(screen.getByRole('button', { name: /Lưu từ/i }))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
      headword: 'dog', meaningVi: 'chó nhà', example: 'The dog barked.', exampleTranslation: 'Con chó sủa.',
    }))
  })

  it('reports an assistant failure instead of silently filling nothing', async () => {
    vi.mocked(aiEnabled).mockResolvedValue(true)
    vi.mocked(callAi).mockResolvedValue({ status: 'error', message: 'Trợ lý gặp lỗi.' })
    render(<AddWordDialog open onClose={() => {}} onAdd={vi.fn()} />)
    await userEvent.click(screen.getByRole('tab', { name: /Thủ công/i }))
    await userEvent.type(screen.getByPlaceholderText('Ví dụ: dog'), 'dog')
    await userEvent.click(await screen.findByRole('button', { name: /Điền bằng AI/i }))
    expect(await screen.findByText('Trợ lý gặp lỗi.')).toBeInTheDocument()
  })
})
