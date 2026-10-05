import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SupabaseClient } from '@supabase/supabase-js'
import { TypingSession } from '@/components/practice/TypingSession'
import { gradeWordById } from '@/lib/wordlist/review'
import { listPracticeWords, listTraditionalForms } from '@/lib/wordlist/store'
import { queryBuilder } from './helpers/supabase'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/wordlist/review', () => ({ gradeWordById: vi.fn() }))
vi.mock('@/lib/wordlist/activity', () => ({ logActivityDay: vi.fn(async () => {}) }))
vi.mock('@/lib/wordlist/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/wordlist/store')>()),
  listPracticeWords: vi.fn(),
}))

const xuexi = { id: 'w1', headword: '学习', meaningVi: 'học', ipa: 'xué xí', audioUrl: null, lang: 'zh' as const }

beforeEach(() => {
  vi.mocked(gradeWordById).mockReset().mockResolvedValue(null)
  vi.mocked(listPracticeWords).mockReset().mockResolvedValue([xuexi])
})

async function answer(text: string) {
  const user = userEvent.setup()
  render(<TypingSession mode="write" />)
  await user.type(await screen.findByRole('textbox', { name: 'Câu trả lời' }), text)
  await user.click(screen.getByRole('button', { name: 'Kiểm tra' }))
}

// Owner decision 2026-10-05: toned pinyin is the word, toneless pinyin is "gần đúng".
describe('writing a Chinese word', () => {
  it('takes toned pinyin as a correct, good recall', async () => {
    await answer('xue2xi2')
    expect(await screen.findByText('Đúng')).toBeInTheDocument()
    expect(gradeWordById).toHaveBeenCalledWith(expect.anything(), 'w1', 'write', 'good')
  })

  it('takes toneless pinyin as a hard recall and says the marks were missed', async () => {
    await answer('xuexi')
    expect(await screen.findByText(/Gần đúng, chú ý dấu/)).toBeInTheDocument()
    expect(gradeWordById).toHaveBeenCalledWith(expect.anything(), 'w1', 'write', 'hard')
  })
})

describe('listTraditionalForms', () => {
  it('maps each saved word to its entry\'s traditional form', async () => {
    const words = queryBuilder({ data: [{ id: 'w1', entry_id: 'zh:学习' }, { id: 'w2', entry_id: 'zh:他' }], error: null })
    const entries = queryBuilder({ data: [{ id: 'zh:学习', traditional: '學習' }], error: null })
    const client = {
      from: vi.fn(() => words),
      schema: vi.fn(() => ({ from: vi.fn(() => entries) })),
    } as unknown as SupabaseClient
    const forms = await listTraditionalForms(client, ['w1', 'w2'])
    expect([...forms]).toEqual([['w1', '學習']])
    expect(words.in).toHaveBeenCalledWith('id', ['w1', 'w2'])
    expect(entries.in).toHaveBeenCalledWith('id', ['zh:学习', 'zh:他'])
  })

  it('reads nothing for no words', async () => {
    const from = vi.fn()
    const forms = await listTraditionalForms({ from } as unknown as SupabaseClient, [])
    expect(forms.size).toBe(0)
    expect(from).not.toHaveBeenCalled()
  })
})
