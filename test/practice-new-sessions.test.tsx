import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TypingSession } from '@/components/practice/TypingSession'
import { QuizClient } from '@/components/practice/QuizClient'
import { gradeWordById } from '@/lib/wordlist/review'
import { choiceRound, typingRound } from '@/lib/practice/rounds'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/wordlist/review', () => ({ gradeWordById: vi.fn() }))
vi.mock('@/lib/wordlist/activity', () => ({ logActivityDay: vi.fn(async () => {}) }))
vi.mock('@/lib/practice/rounds', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/practice/rounds')>()),
  typingRound: vi.fn(),
  choiceRound: vi.fn(),
}))

const giveUp = {
  id: 'w1', headword: 'give up', meaningVi: 'bỏ cuộc', ipa: null, audioUrl: null, lang: 'en' as const,
  answer: 'gave up',
  gap: { before: 'She ', answer: 'gave up', after: ' smoking.', translationVi: 'Cô ấy bỏ thuốc.' },
}

beforeEach(() => {
  vi.mocked(gradeWordById).mockReset().mockResolvedValue(null)
})

async function type(text: string) {
  const user = userEvent.setup()
  await user.type(await screen.findByRole('textbox', { name: 'Câu trả lời' }), text)
  await user.click(screen.getByRole('button', { name: 'Kiểm tra' }))
}

describe('Điền vào câu', () => {
  it('shows the sentence with a gap and the meaning as the cue', async () => {
    vi.mocked(typingRound).mockResolvedValue([giveUp])
    render(<TypingSession mode="cloze" />)
    expect(await screen.findByText('chỗ trống')).toBeInTheDocument()
    expect(screen.getByText('bỏ cuộc')).toBeInTheDocument()
    expect(screen.queryByText('gave up')).not.toBeInTheDocument()
  })

  it('takes the form the sentence needs as a good recall', async () => {
    vi.mocked(typingRound).mockResolvedValue([giveUp])
    render(<TypingSession mode="cloze" />)
    await type('gave up')
    expect(await screen.findByText('Đúng')).toBeInTheDocument()
    expect(screen.getByText('Cô ấy bỏ thuốc.')).toBeInTheDocument()
    expect(gradeWordById).toHaveBeenCalledWith(expect.anything(), 'w1', 'cloze', 'good')
  })

  it('takes the right word in the wrong form as a hard recall', async () => {
    vi.mocked(typingRound).mockResolvedValue([giveUp])
    render(<TypingSession mode="cloze" />)
    await type('give up')
    expect(await screen.findByText(/Gần đúng/)).toBeInTheDocument()
    expect(gradeWordById).toHaveBeenCalledWith(expect.anything(), 'w1', 'cloze', 'hard')
  })
})

describe('Dạng từ', () => {
  it('asks for the form and accepts another spelling of it', async () => {
    vi.mocked(typingRound).mockResolvedValue([{
      id: 'w2', headword: 'learn', meaningVi: 'học', ipa: null, audioUrl: null, lang: 'en', cue: 'quá khứ đơn', answer: 'learned', accepted: ['learnt'],
    }])
    render(<TypingSession mode="forms" />)
    expect(await screen.findByText('Gõ dạng quá khứ đơn')).toBeInTheDocument()
    await type('learnt')
    expect(await screen.findByText('Đúng')).toBeInTheDocument()
    expect(gradeWordById).toHaveBeenCalledWith(expect.anything(), 'w2', 'forms', 'good')
  })
})

describe('Nghe chọn nghĩa', () => {
  it('hides the word until a meaning is chosen, then grades recognition', async () => {
    vi.mocked(choiceRound).mockResolvedValue([{
      id: 'w3', headword: 'spot', ipa: '/spɒt/', lang: 'en', options: ['chỗ', 'mèo'], answer: 'chỗ', audioUrl: null,
    }])
    const user = userEvent.setup()
    render(<QuizClient mode="listen" />)
    expect(await screen.findByRole('button', { name: 'Phát âm từ cần nghe' })).toBeInTheDocument()
    expect(screen.queryByText('spot')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /chỗ/ }))
    expect(await screen.findByText('spot')).toBeInTheDocument()
    expect(gradeWordById).toHaveBeenCalledWith(expect.anything(), 'w3', 'listen', 'good')
  })
})
