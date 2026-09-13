import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, render, screen } from '@testing-library/react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useGradeSync } from '@/lib/hooks/useGradeSync'
import { GradeSyncWarning } from '@/components/practice/GradeSyncWarning'
import { gradeWordById } from '@/lib/wordlist/review'
import { logActivityDay } from '@/lib/wordlist/activity'

vi.mock('@/lib/wordlist/review', () => ({ gradeWordById: vi.fn() }))
vi.mock('@/lib/wordlist/activity', () => ({ logActivityDay: vi.fn() }))

const supabase = {} as SupabaseClient

beforeEach(() => { vi.mocked(gradeWordById).mockReset(); vi.mocked(logActivityDay).mockReset() })

describe('useGradeSync', () => {
  it('writes the grade without making the caller wait', async () => {
    vi.mocked(gradeWordById).mockResolvedValue(undefined as never)
    const { result } = renderHook(() => useGradeSync(supabase))
    await act(async () => { result.current.record('w1', 'good') })
    expect(gradeWordById).toHaveBeenCalledWith(supabase, 'w1', 'good')
    expect(result.current.failed).toBe(false)
  })

  // Speaking practice deliberately does not grade a failure -- a misheard word
  // is usually the microphone, not the learner -- so `gradeForMode` returns null
  // and nothing should be written or reported.
  it('writes nothing when the mode declined to grade', async () => {
    const { result } = renderHook(() => useGradeSync(supabase))
    await act(async () => { result.current.record('w1', null) })
    expect(gradeWordById).not.toHaveBeenCalled()
    expect(result.current.failed).toBe(false)
  })

  // The whole point: a session on a dropped connection used to finish with
  // "Kết quả: 9/10 — Tuyệt vời!" having written no fsrs_* column at all, and
  // nothing on screen told the learner tomorrow's queue was untouched.
  it('remembers a failed write', async () => {
    vi.mocked(gradeWordById).mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useGradeSync(supabase))
    await act(async () => { result.current.record('w1', 'good') })
    expect(result.current.failed).toBe(true)
  })

  it('stays failed after a later answer saves, because the session is already short', async () => {
    vi.mocked(gradeWordById).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined as never)
    const { result } = renderHook(() => useGradeSync(supabase))
    await act(async () => { result.current.record('w1', 'good') })
    await act(async () => { result.current.record('w2', 'good') })
    expect(result.current.failed).toBe(true)
  })

  // `void logActivityDay(supabase)` with no catch at all was an unhandled
  // rejection, and worse than a quiet one: computeStreak counts consecutive
  // days, so a single unrecorded day resets a forty-day streak to zero with no
  // way to restore it from the interface.
  it('reports a failed streak write through the same warning', async () => {
    vi.mocked(logActivityDay).mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useGradeSync(supabase))
    await act(async () => { result.current.logDay() })
    expect(result.current.failed).toBe(true)
  })

  it('says nothing when the streak write lands', async () => {
    vi.mocked(logActivityDay).mockResolvedValue(undefined)
    const { result } = renderHook(() => useGradeSync(supabase))
    await act(async () => { result.current.logDay() })
    expect(logActivityDay).toHaveBeenCalledWith(supabase)
    expect(result.current.failed).toBe(false)
  })
})

describe('GradeSyncWarning', () => {
  it('says nothing when every answer was saved', () => {
    const { container } = render(<GradeSyncWarning failed={false} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('tells the learner their progress did not save', () => {
    render(<GradeSyncWarning failed />)
    expect(screen.getByText(/Không lưu được tiến độ/)).toBeInTheDocument()
  })
})
