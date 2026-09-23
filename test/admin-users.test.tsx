import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import { AccountTable } from '@/components/admin/AccountTable'
import { parseAccounts, type AdminAccount } from '@/lib/admin/users'

/** Rows as `admin.users()` returned them on production, trimmed to three. */
const ACCOUNTS: AdminAccount[] = parseAccounts([
  { id: 'f5849087-73c3-4196-8aa0-491f7506c07b', email: null, role: 'learner', display_name: null,
    created_at: '2026-09-12T19:34:12Z', words: 410, last_active_at: '2026-09-20T04:43:34Z' },
  { id: 'bcfc744d-d41b-443b-b0e3-5556ac0cb1fb', email: 'owner@example.com', role: 'admin', display_name: 'Hiệp',
    created_at: '2026-09-15T03:05:35Z', words: 35, last_active_at: '2026-09-23T01:34:35Z' },
  { id: '92af3607-d570-4bc6-9937-0372c9a32d11', email: 'qa@example.com', role: 'learner', display_name: null,
    created_at: '2026-09-22T18:34:34Z', words: 0, last_active_at: null },
])

const fetchMock = vi.fn()

beforeEach(() => {
  refresh.mockClear()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
const rowOf = (text: string) => screen.getByText(text).closest('tr') as HTMLElement

describe('parseAccounts', () => {
  it('reads an account without an email as anonymous', () => {
    expect(ACCOUNTS.map((a) => a.kind)).toEqual(['anonymous', 'permanent', 'permanent'])
  })
})

describe('AccountTable', () => {
  it('shows each account with its saved words, and a total that is their sum', () => {
    render(<AccountTable accounts={ACCOUNTS} />)
    expect(rowOf('owner@example.com')).toHaveTextContent('35')
    expect(rowOf('Ẩn danh f5849087')).toHaveTextContent('410')
    expect(screen.getByText('3 tài khoản').closest('tr')).toHaveTextContent('445')
  })

  it('offers no delete on an admin account', () => {
    render(<AccountTable accounts={ACCOUNTS} />)
    expect(within(rowOf('owner@example.com')).getByRole('button', { name: 'Xoá' })).toBeDisabled()
  })

  it('deletes only once the email is typed, and sends the typed text for the database to check', async () => {
    fetchMock.mockResolvedValue(ok({ deleted: ACCOUNTS[2].id, words: 0 }))
    render(<AccountTable accounts={ACCOUNTS} />)
    await userEvent.click(within(rowOf('qa@example.com')).getByRole('button', { name: 'Xoá' }))

    const confirm = screen.getByRole('button', { name: 'Xoá vĩnh viễn' })
    expect(confirm).toBeDisabled()
    await userEvent.type(screen.getByRole('textbox'), 'qa@example')
    expect(confirm).toBeDisabled()
    await userEvent.type(screen.getByRole('textbox'), '.com')
    expect(confirm).toBeEnabled()
    await userEvent.click(confirm)

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/accounts', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      action: 'delete', id: ACCOUNTS[2].id, confirm: 'qa@example.com',
    })
    expect(refresh).toHaveBeenCalled()
  })

  it('asks for the id when the account has no email', async () => {
    render(<AccountTable accounts={ACCOUNTS} />)
    await userEvent.click(within(rowOf('Ẩn danh f5849087')).getByRole('button', { name: 'Xoá' }))
    expect(screen.getByText(ACCOUNTS[0].id)).toBeInTheDocument()
  })

  it('merges into the chosen account and reports what moved', async () => {
    fetchMock.mockResolvedValue(ok({ moved: 410, kept: 0, days: 3 }))
    render(<AccountTable accounts={ACCOUNTS} />)
    await userEvent.click(within(rowOf('Ẩn danh f5849087')).getByRole('button', { name: 'Gộp vào…' }))
    await userEvent.selectOptions(screen.getByRole('combobox'), ACCOUNTS[1].id)
    await userEvent.click(screen.getByRole('button', { name: 'Gộp' }))

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      action: 'merge', from: ACCOUNTS[0].id, into: ACCOUNTS[1].id,
    })
    expect(await screen.findByText('Đã chuyển 410 từ, giữ lại 0 từ trùng, gộp 3 ngày luyện tập.')).toBeInTheDocument()
  })

  it('shows the refusal the server gives and keeps the dialog open', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Chuỗi xác nhận không khớp.' }), { status: 409 }))
    render(<AccountTable accounts={ACCOUNTS} />)
    await userEvent.click(within(rowOf('qa@example.com')).getByRole('button', { name: 'Xoá' }))
    await userEvent.type(screen.getByRole('textbox'), 'qa@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Xoá vĩnh viễn' }))

    expect(await screen.findByText('Chuỗi xác nhận không khớp.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xoá vĩnh viễn' })).toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
  })
})
