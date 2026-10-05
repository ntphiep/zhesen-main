import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AccountSettings } from '@/components/account/AccountSettings'
import { WordlistDistribution } from '@/components/wordlist/WordlistDistribution'
import { computeSkillProgress, type StatRow, type WordlistStats } from '@/lib/wordlist/stats'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/wordlist/store', () => ({ listWords: vi.fn(async () => []) }))

const row = (reps: number, interval: number, recogReps: number, recogInterval: number): StatRow => ({
  lang: 'en', status: 'new', srsIntervalDays: interval, srsDueAt: '2026-10-05T00:00:00Z',
  srsLastReviewedAt: null, srsReps: reps, recogIntervalDays: recogInterval, recogReps,
})

// Quiz and match build recognition, review and typing build recall, so one word can be
// learned for one and unseen for the other.
const rows = [row(0, 0, 3, 30), row(2, 5, 2, 25), row(4, 40, 4, 60), row(0, 0, 0, 0)]

const stats: WordlistStats = {
  total: 4, due: 0, learned: 1, reviewedToday: 0, streak: 0,
  byStatus: { new: 4, learning: 0, known: 0 },
  byLang: { en: 4, es: 0, zh: 0 },
  skills: computeSkillProgress(rows),
}

describe('computeSkillProgress', () => {
  it('splits each skill into learned, learning and unseen from its own columns', () => {
    expect(computeSkillProgress(rows)).toEqual({
      recall: { total: 4, learned: 1, learning: 1, unseen: 2 },
      recognition: { total: 4, learned: 3, learning: 0, unseen: 1 },
    })
  })
})

describe('the skill meters', () => {
  it('stack "Nhớ ra" above "Nhận ra" on the account page', () => {
    render(<AccountSettings email="a@b.com" profile={null} stats={stats} joinedAt={null} />)
    const recall = screen.getByText('Nhớ ra')
    const recognition = screen.getByText('Nhận ra')
    expect(recall.compareDocumentPosition(recognition) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('Đã thuộc 1 · Đang học 1 · Chưa ôn 2')).toBeInTheDocument()
    expect(screen.getByText('Đã thuộc 3 · Đang học 0 · Chưa ôn 1')).toBeInTheDocument()
  })

  it('show on the practice page beside the status bars', () => {
    render(<WordlistDistribution stats={stats} />)
    expect(screen.getByText('Theo trạng thái')).toBeInTheDocument()
    expect(screen.getByText('Nhớ ra')).toBeInTheDocument()
    expect(screen.getByText('Nhận ra')).toBeInTheDocument()
  })
})
