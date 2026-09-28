import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccountSettings } from '@/components/account/AccountSettings'
import { setPassword, signOut } from '@/lib/auth/account'
import { setDisplayName, type Profile } from '@/lib/auth/profile'
import { listWords } from '@/lib/wordlist/store'
import { downloadTextFile } from '@/lib/wordlist/download'
import { resetStoredPrefCache } from '@/lib/hooks/useStoredPref'
import { THEME_KEY } from '@/lib/theme'
import type { WordlistStats } from '@/lib/wordlist/stats'
import type { UserWord } from '@/lib/wordlist/types'

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/auth/account', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/account')>()),
  setPassword: vi.fn(async () => ({ status: 'active' as const })),
  signOut: vi.fn(async () => {}),
}))
vi.mock('@/lib/auth/profile', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/profile')>()),
  setDisplayName: vi.fn(async () => ({ ok: true as const })),
}))
vi.mock('@/lib/wordlist/store', () => ({ listWords: vi.fn(async () => [] as UserWord[]) }))
vi.mock('@/lib/wordlist/download', () => ({ downloadTextFile: vi.fn() }))

const learner: Profile = { id: 'u1', role: 'learner', displayName: null }

const stats: WordlistStats = {
  total: 15, due: 4, learned: 3, reviewedToday: 2, streak: 6,
  byStatus: { new: 9, learning: 4, known: 2 },
  byLang: { en: 12, es: 3, zh: 0 },
}

const empty: WordlistStats = {
  total: 0, due: 0, learned: 0, reviewedToday: 0, streak: 0,
  byStatus: { new: 0, learning: 0, known: 0 },
  byLang: { en: 0, es: 0, zh: 0 },
}

function show(props: Partial<React.ComponentProps<typeof AccountSettings>> = {}) {
  return render(
    <AccountSettings email="a@b.com" profile={learner} stats={stats} joinedAt={null} {...props} />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  resetStoredPrefCache()
  delete document.documentElement.dataset.theme
})

describe('AccountSettings', () => {
  it('shows the address and a way out', async () => {
    show()
    expect(screen.getByText('a@b.com')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }))
    expect(signOut).toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/')
  })

  // RLS refuses an update that changes the role, so a control here would be a
  // button that always fails. The role is granted from the database on purpose.
  it('shows the role and offers no way to change it', () => {
    show({ profile: { ...learner, role: 'admin' } })
    expect(screen.getByText('Quản trị')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Vai trò|Quyền/i)).toBeNull()
  })

  it('treats a missing profile as an ordinary learner rather than breaking', () => {
    show({ profile: null })
    expect(screen.getByText('Người học')).toBeInTheDocument()
  })

  it('saves the display name', async () => {
    show()
    await userEvent.type(screen.getByLabelText('Tên hiển thị'), 'Hiệp')
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(setDisplayName).toHaveBeenCalledWith(expect.anything(), 'Hiệp')
  })

  // This box is also the second half of the anonymous upgrade: a learner who
  // attached an email arrives here with a confirmed address and no password.
  it('sets a password and clears the box afterwards', async () => {
    show()
    const box = screen.getByLabelText('Mật khẩu mới')
    await userEvent.type(box, 'longenough1')
    await userEvent.click(screen.getByRole('button', { name: 'Đặt mật khẩu' }))

    expect(setPassword).toHaveBeenCalledWith(expect.anything(), 'longenough1')
    expect(await screen.findByText(/Đã đặt mật khẩu mới/)).toBeInTheDocument()
    expect(box).toHaveValue('')
  })

  it('shows why the password was refused instead of pretending it worked', async () => {
    vi.mocked(setPassword).mockResolvedValue({ status: 'error', message: 'New password should be different' })
    show()
    await userEvent.type(screen.getByLabelText('Mật khẩu mới'), 'longenough1')
    await userEvent.click(screen.getByRole('button', { name: 'Đặt mật khẩu' }))
    expect(await screen.findByText('New password should be different')).toBeInTheDocument()
  })

  // #23: the browser would stop an empty box with an English bubble. `setPassword`
  // answers it in Vietnamese instead.
  it('hands an empty password box to the Vietnamese check, not the browser', async () => {
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Đặt mật khẩu' }))
    expect(setPassword).toHaveBeenCalledWith(expect.anything(), '')
  })

  // #17: a password manager needs the account's username in the same form to know
  // which saved password the new one replaces.
  it('names the new password and carries the username for a password manager', () => {
    show()
    const box = screen.getByLabelText('Mật khẩu mới')
    expect(box).toHaveAttribute('id', 'new-password')
    expect(box).toHaveAttribute('name', 'new-password')
    expect(box).toHaveAttribute('autocomplete', 'new-password')
    const username = box.closest('form')?.querySelector('input[autocomplete="username"]')
    expect(username).toHaveValue('a@b.com')
  })

  it('reports progress, and the split by status and language', () => {
    show()
    expect(screen.getByText('Tổng số từ')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
    expect(screen.getByText(/Mới 9 · Đang học 4 · Đã biết 2/)).toBeInTheDocument()
    // Chinese has no words, so it is not offered as a line with a zero on it.
    expect(screen.getByText(/Tiếng Anh 12 · Tiếng Tây Ban Nha 3/)).toBeInTheDocument()
  })

  it('says what to do instead of showing an empty progress panel', () => {
    show({ stats: empty })
    expect(screen.getByText(/Chưa có từ\./)).toBeInTheDocument()
    expect(screen.queryByText('Chuỗi ngày')).toBeNull()
  })

  it('applies the chosen scheme and remembers it', async () => {
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Tối' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')

    await userEvent.click(screen.getByRole('button', { name: 'Sáng' }))
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  // The export is the copy a learner keeps, so it reads the whole notebook rather
  // than whatever page the wordlist is showing.
  it('exports every saved word, not a page of them', async () => {
    const word = { headword: 'dog', lang: 'en', tags: [] } as unknown as UserWord
    vi.mocked(listWords).mockResolvedValue([word])
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Tải CSV' }))
    expect(listWords).toHaveBeenCalled()
    const [name, body] = vi.mocked(downloadTextFile).mock.calls[0]
    expect(name).toBe('wordlist.csv')
    expect(body).toContain('dog')
  })

  it('says so when the export cannot be read instead of downloading nothing', async () => {
    vi.mocked(listWords).mockRejectedValue(new Error('offline'))
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Tải Anki (TSV)' }))
    expect(await screen.findByText(/Chưa tải được sổ tay/)).toBeInTheDocument()
    expect(downloadTextFile).not.toHaveBeenCalled()
  })

  // A download that works is its own confirmation, but the failure before it must not
  // stay on screen contradicting it.
  it('clears the failure once an export goes through', async () => {
    vi.mocked(listWords).mockRejectedValueOnce(new Error('offline'))
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Tải CSV' }))
    expect(await screen.findByText(/Chưa tải được sổ tay/)).toBeInTheDocument()

    vi.mocked(listWords).mockResolvedValue([])
    await userEvent.click(screen.getByRole('button', { name: 'Tải CSV' }))
    expect(screen.queryByText(/Chưa tải được sổ tay/)).toBeNull()
  })

  it('offers no export while the notebook is empty', () => {
    show({ stats: empty })
    expect(screen.getByRole('button', { name: 'Tải CSV' })).toBeDisabled()
  })
})
