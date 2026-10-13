import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { PersonalStrip } from '@/components/search/PersonalStrip'
import { recentEntries } from '@/lib/dictionary/recent'

const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  listRecentWords: vi.fn(),
  getWordlistStats: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getSession: m.getSession } }),
}))
vi.mock('@/lib/wordlist/store', () => ({ listRecentWords: m.listRecentWords }))
vi.mock('@/lib/wordlist/stats', () => ({ getWordlistStats: m.getWordlistStats }))

beforeEach(() => {
  localStorage.clear()
  recentEntries.reset()
  m.getSession.mockResolvedValue({ data: { session: null } })
  m.listRecentWords.mockResolvedValue([])
  m.getWordlistStats.mockResolvedValue({ total: 0, due: 0 })
})

describe('PersonalStrip', () => {
  it('invites an account to save a word while its notebook is empty', async () => {
    m.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    render(<PersonalStrip />)
    expect(await screen.findByText(/Tra một từ để lưu/i)).toBeInTheDocument()
    expect(screen.queryByText('Tra gần đây')).toBeNull()
  })

  it('shows no notebook to a visitor without an account', async () => {
    render(<PersonalStrip />)
    await waitFor(() => expect(m.getSession).toHaveBeenCalled())
    expect(screen.queryByText('Sổ tay')).toBeNull()
    expect(screen.queryByText(/Tra một từ để lưu/i)).toBeNull()
  })

  it('lists the words this browser has opened, newest first', () => {
    recentEntries.record({ id: 'en:fish', headword: 'fish', lang: 'en', glossVi: 'Cá' })
    recentEntries.record({ id: 'es:mesa', headword: 'mesa', lang: 'es', glossVi: 'Cái bàn' })
    render(<PersonalStrip />)
    const links = screen.getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['mesa', 'fish'])
    expect(links[0]).toHaveAttribute('href', '/dictionary/es/mesa')
  })

  it('shows the saved words and the number due once an account holds some', async () => {
    m.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    m.listRecentWords.mockResolvedValue([
      { id: 'w1', headword: 'hedgehog', entryId: 'en:hedgehog', meaningVi: 'Con nhím' },
    ])
    m.getWordlistStats.mockResolvedValue({ total: 1, due: 12 })

    render(<PersonalStrip />)
    expect(await screen.findByText('12 từ đến hạn ôn')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'hedgehog' })).toHaveAttribute('href', '/dictionary/en/hedgehog')
    expect(screen.getByRole('link', { name: 'Luyện tập' })).toHaveAttribute('href', '/practice')
  })
})
