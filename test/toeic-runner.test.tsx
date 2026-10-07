import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ToeicTest } from '@/lib/practice/toeic/tests'
import type { PackedWord } from '@/lib/practice/toeic/passage'

const { aiOn } = vi.hoisted(() => ({ aiOn: { current: false } }))
vi.mock('@/lib/ai/browser', () => ({ aiEnabled: vi.fn(async () => aiOn.current), callAi: vi.fn() }))
vi.mock('@/lib/supabase/client', async () => {
  const { accountAuthStub } = await import('./helpers/supabase')
  return { createClient: () => accountAuthStub(null) }
})

import { ToeicRunner } from '@/components/practice/ToeicRunner'
import { resetStoredPrefCache } from '@/lib/hooks/useStoredPref'
import { resetAiEnabledCache } from '@/lib/hooks/useAiEnabled'
import { onAskAi, type AskAi } from '@/lib/ai/ask'
import { EXAM_MS, HISTORY_KEY, PROGRESS_KEY } from '@/lib/practice/toeic/session'

const TEST: ToeicTest = {
  id: 'test01',
  titleVi: 'Đề 1',
  version: 'v1',
  groups: [
    {
      id: 'p5-101', part: 5, intro: '', passages: [],
      questions: [{
        number: 101, stem: 'Reports are due ------- Friday.', options: ['by', 'until', 'since', 'among'], answer: 0,
        type: 'preposition', evidence: '', explanationVi: '"by" chỉ hạn chót.', vi: 'Báo cáo phải nộp trước thứ Sáu.',
      }],
    },
    {
      id: 'p7-102', part: 7, intro: 'Questions 102-103 refer to the following notice.',
      passages: [{ type: 'notice', text: 'The lobby closes on Monday.\n\nGuests should use the side door.' }],
      questions: [
        {
          number: 102, stem: 'When does the lobby close?', options: ['Sunday', 'Monday', 'Friday', 'Today'], answer: 1,
          type: 'detail', evidence: 'The lobby closes on Monday.', explanationVi: 'Câu đầu nói thứ Hai.',
        },
        {
          number: 103, stem: 'What should guests do?', options: ['Wait', 'Call', 'Use the side door', 'Leave'], answer: 2,
          type: 'detail', evidence: 'Guests should use the side door.', explanationVi: 'Câu cuối nói dùng cửa hông.',
        },
      ],
    },
  ],
}

const lobby: PackedWord = ['lobby', 'en:lobby', 'lobby', null, 'noun', 'sảnh', null, 'B1', null]

beforeEach(() => {
  localStorage.clear()
  resetStoredPrefCache()
  resetAiEnabledCache()
  aiOn.current = false
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const option = (n: number, letter: string) =>
  within(document.getElementById(`q-${n}`) as HTMLElement).getByText(`(${letter})`).closest('label') as HTMLElement

describe('ToeicRunner, timed test', () => {
  it('takes answers, navigates, flags and submits to a score range', async () => {
    const user = userEvent.setup()
    render(<ToeicRunner test={TEST} words={[]} />)
    await user.click(screen.getByRole('button', { name: 'Bắt đầu thi' }))
    expect(screen.getByRole('timer')).toHaveTextContent('75:00')

    await user.click(option(101, 'A'))
    expect(screen.getByText('Đã làm 1/3')).toBeInTheDocument()
    // No verdict while the test runs.
    expect(screen.queryByText('Đúng.')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Câu sau' }))
    expect(document.querySelector('article')).toHaveTextContent('The lobby closes on Monday.')
    expect(document.getElementById('q-102')).toHaveAttribute('data-current')

    const flag = within(document.getElementById('q-103') as HTMLElement).getByRole('button', { name: 'Đánh dấu' })
    await user.click(flag)
    expect(screen.getByRole('button', { name: 'Câu 103, đã đánh dấu' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Câu 101, đã làm' })).toBeInTheDocument()

    await user.click(option(102, 'A'))
    await user.click(screen.getAllByRole('button', { name: 'Nộp bài' })[0])
    expect(screen.getByText('Còn 1 câu chưa làm. Đã nộp thì không sửa được.')).toBeInTheDocument()
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Nộp bài' }))

    expect(screen.getByRole('heading', { name: 'Kết quả' })).toBeInTheDocument()
    expect(screen.getByText('1/3', { selector: 'div' })).toBeInTheDocument()
    expect(screen.getByText(/Reading ước tính/)).toBeInTheDocument()
    expect(screen.getByText('Điểm do Zhesen ước lượng, không theo thang điểm chính thức.')).toBeInTheDocument()
    // Wrong and unanswered questions are listed first, each with its key and explanation.
    expect(screen.getByText('Sai. Đáp án (B).')).toBeInTheDocument()
    expect(screen.getByText('Chưa chọn. Đáp án (C).')).toBeInTheDocument()
    expect(screen.getByText('Câu cuối nói dùng cửa hông.')).toBeInTheDocument()
    expect(screen.queryByText('"by" chỉ hạn chót.')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Tất cả (3)' }))
    expect(screen.getByText('"by" chỉ hạn chót.')).toBeInTheDocument()

    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '{}')
    expect(saved.test01).toMatchObject({ label: 'Thi thử', correct: 1, total: 3 })
    expect(saved.test01.score).not.toBeNull()
  })

  it('submits on its own when the time runs out', () => {
    vi.useFakeTimers()
    render(<ToeicRunner test={TEST} words={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu thi' }))
    act(() => { vi.advanceTimersByTime(EXAM_MS - 60_000) })
    expect(screen.getByRole('timer')).toHaveTextContent('1:00')
    act(() => { vi.advanceTimersByTime(61_000) })
    expect(screen.getByRole('heading', { name: 'Kết quả' })).toBeInTheDocument()
    expect(screen.getByText('0/3', { selector: 'div' })).toBeInTheDocument()
  })
})

describe('ToeicRunner, leaving and coming back', () => {
  it('keeps an unfinished test through a link out and clears it on submit', async () => {
    const user = userEvent.setup()
    const first = render(<ToeicRunner test={TEST} words={[]} />)
    await user.click(screen.getByRole('button', { name: 'Bắt đầu thi' }))
    await user.click(option(101, 'A'))
    await user.click(screen.getByRole('button', { name: 'Câu sau' }))
    await user.click(within(document.getElementById('q-103') as HTMLElement).getByRole('button', { name: 'Đánh dấu' }))
    first.unmount()

    render(<ToeicRunner test={TEST} words={[]} />)
    expect(screen.getByText(/Đang làm dở, Thi thử, còn 7[45]:\d\d\./)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Làm tiếp' }))
    expect(screen.getByRole('timer')).toBeInTheDocument()
    expect(screen.getByText('Đã làm 1/3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Câu 103, đã đánh dấu' })).toBeInTheDocument()
    expect(document.getElementById('q-102')).toHaveAttribute('data-current')

    await user.click(screen.getAllByRole('button', { name: 'Nộp bài' })[0])
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Nộp bài' }))
    expect(JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? '{}')).toEqual({})
  })

  it('keeps the test left halfway when a part is only opened', async () => {
    const user = userEvent.setup()
    const first = render(<ToeicRunner test={TEST} words={[]} />)
    await user.click(screen.getByRole('button', { name: 'Bắt đầu thi' }))
    await user.click(option(101, 'A'))
    first.unmount()
    const second = render(<ToeicRunner test={TEST} words={[]} part={5} />)
    second.unmount()
    render(<ToeicRunner test={TEST} words={[]} />)
    expect(screen.getByText(/Đang làm dở, Thi thử/)).toBeInTheDocument()
  })
})

describe('ToeicRunner, navigator on a phone', () => {
  it('closes the navigator and brings the chosen question to the top', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(max-width: 899px)' }))
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    const user = userEvent.setup()
    render(<ToeicRunner test={TEST} words={[]} />)
    await user.click(screen.getByRole('button', { name: 'Bắt đầu thi' }))
    const nav = screen.getByText('Bảng câu hỏi').closest('details') as HTMLDetailsElement
    await user.click(screen.getByText('Bảng câu hỏi'))
    expect(nav.open).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Câu 103' }))
    expect(nav.open).toBe(false)
    expect(document.getElementById('q-103')).toHaveAttribute('data-current')
    expect(scroll).toHaveBeenLastCalledWith({ block: 'start' })
  })
})

describe('ToeicRunner, part practice', () => {
  it('opens the part named in the address and explains each pick at once', async () => {
    const user = userEvent.setup()
    render(<ToeicRunner test={TEST} words={[lobby]} part={7} />)
    expect(await screen.findByText('Part 7 · 1/1')).toBeInTheDocument()
    // Passage words are tappable from the first paint.
    expect(screen.getAllByRole('button', { name: 'lobby' }).length).toBeGreaterThan(0)

    await user.click(option(102, 'A'))
    expect(screen.getByText('Sai. Đáp án (B).')).toBeInTheDocument()
    expect(screen.getByText('Câu đầu nói thứ Hai.')).toBeInTheDocument()
    // The evidence is set in bold on a ruled block.
    const proof = screen.getByText('closes').closest('p')
    expect(proof).toHaveAttribute('data-ev')
    expect(within(proof as HTMLElement).getAllByText(/closes|Monday/).some((el) => el.closest('b'))).toBe(true)
    expect(screen.getByRole('radio', { name: /Sunday/ })).toBeDisabled()

    await user.click(option(103, 'C'))
    expect(screen.getAllByText('Đúng.')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Xem kết quả' }))

    expect(screen.getByText('1/2', { selector: 'div' })).toBeInTheDocument()
    expect(screen.queryByText(/Reading ước tính/)).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Làm lại câu sai' }))
    expect(screen.getByText('Câu sai · 1/1')).toBeInTheDocument()
    expect(document.getElementById('q-102')).toBeInTheDocument()
    expect(document.getElementById('q-103')).toBeNull()
  })

  it('opens the assistant on a graded question only when it is on', async () => {
    aiOn.current = true
    const asked: AskAi[] = []
    const stop = onAskAi((d) => asked.push(d))
    const user = userEvent.setup()
    render(<ToeicRunner test={TEST} words={[]} />)
    await user.click(screen.getByRole('button', { name: 'Part 5' }))
    expect(screen.queryByRole('button', { name: 'Hỏi AI về câu này' })).toBeNull()
    await user.click(option(101, 'B'))
    await user.click(await screen.findByRole('button', { name: 'Hỏi AI về câu này' }))
    stop()
    expect(asked).toHaveLength(1)
    expect(asked[0].label).toBe('câu 101')
    expect(asked[0].seed).toContain('Đáp án: (A) by.')
    expect(asked[0].seed).toContain('Người học chọn: (B) until.')
  })
})
