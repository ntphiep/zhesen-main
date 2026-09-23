'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { NoticeBar, useNotice } from '@/components/ui/Notice'
import { postAdmin } from '@/lib/admin/browser'
import { confirmationFor, type AdminAccount } from '@/lib/admin/users'
import { formatWordDate } from '@/lib/wordlist/format'
import { z } from '@/lib/zod'

const merged = z.object({ moved: z.number(), kept: z.number(), days: z.number() })

type Pending =
  | { kind: 'delete'; account: AdminAccount }
  | { kind: 'merge'; account: AdminAccount }
  | null

const name = (a: AdminAccount) => a.email ?? `Ẩn danh ${a.id.slice(0, 8)}`

/**
 * Every account, with its saved words and last activity, and the two writes an admin
 * makes on one: delete it, or move its saved words into another account. Both go through
 * app/api/admin/accounts/route.ts, which the database gates again.
 */
export function AccountTable({ accounts }: { accounts: AdminAccount[] }) {
  const router = useRouter()
  const { notice, notify, dismiss } = useNotice()
  const [pending, setPending] = useState<Pending>(null)
  const [typed, setTyped] = useState('')
  const [into, setInto] = useState('')
  const [busy, setBusy] = useState(false)

  const total = accounts.reduce((n, a) => n + a.words, 0)

  function open(next: Pending) {
    setTyped('')
    setInto('')
    setPending(next)
  }

  async function confirmDelete(a: AdminAccount) {
    setBusy(true)
    const outcome = await postAdmin('/api/admin/accounts', { action: 'delete', id: a.id, confirm: typed })
    setBusy(false)
    if (!outcome.ok) return notify(outcome.message)
    setPending(null)
    notify(`Đã xoá ${name(a)}.`, 'info')
    router.refresh()
  }

  async function confirmMerge(a: AdminAccount) {
    setBusy(true)
    const outcome = await postAdmin('/api/admin/accounts', { action: 'merge', from: a.id, into })
    setBusy(false)
    if (!outcome.ok) return notify(outcome.message)
    const r = merged.parse(outcome.data)
    setPending(null)
    notify(`Đã chuyển ${r.moved} từ, giữ lại ${r.kept} từ trùng, gộp ${r.days} ngày luyện tập.`, 'info')
    router.refresh()
  }

  const target = pending?.account
  const others = target ? accounts.filter((a) => a.id !== target.id) : []

  return (
    <div>
      <div className="relative overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-xs font-medium uppercase tracking-wide text-black/45">
              <th className="py-2 pr-4">Tài khoản</th>
              <th className="py-2 pr-4">Loại</th>
              <th className="py-2 pr-4 text-right">Từ đã lưu</th>
              <th className="py-2 pr-4">Hoạt động gần nhất</th>
              <th className="py-2 pr-4">Tạo ngày</th>
              <th className="py-2"><span className="sr-only">Thao tác</span></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className="border-b border-black/5">
                <td className="py-2 pr-4">
                  <div className="font-medium">{name(a)}</div>
                  {a.displayName && <div className="text-xs text-black/50">{a.displayName}</div>}
                </td>
                <td className="whitespace-nowrap py-2 pr-4">
                  {a.kind === 'permanent' ? 'Có email' : 'Ẩn danh'}
                  {a.role === 'admin' && (
                    <span className="ml-2 rounded-full bg-black/5 px-2 py-0.5 text-xs text-black/60">Quản trị</span>
                  )}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">{a.words.toLocaleString('vi-VN')}</td>
                <td className="whitespace-nowrap py-2 pr-4">{a.lastActiveAt ? formatWordDate(a.lastActiveAt) : '–'}</td>
                <td className="whitespace-nowrap py-2 pr-4">{formatWordDate(a.createdAt)}</td>
                <td className="whitespace-nowrap py-2 text-right">
                  <button
                    type="button"
                    onClick={() => open({ kind: 'merge', account: a })}
                    disabled={a.words === 0}
                    className="rounded-lg px-2 py-1 text-black/60 hover:bg-black/5 disabled:opacity-30"
                  >
                    Gộp vào…
                  </button>
                  <button
                    type="button"
                    onClick={() => open({ kind: 'delete', account: a })}
                    disabled={a.role === 'admin'}
                    className="rounded-lg px-2 py-1 text-red-600 hover:bg-red-600/10 disabled:opacity-30"
                  >
                    Xoá
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="text-sm text-black/60">
              <td className="py-2 pr-4">{accounts.length} tài khoản</td>
              <td />
              <td className="py-2 pr-4 text-right tabular-nums">{total.toLocaleString('vi-VN')}</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>

      <Modal
        open={pending?.kind === 'delete'}
        onClose={() => setPending(null)}
        title="Xoá tài khoản"
        titleId="admin-delete-title"
        widthClass="max-w-md"
      >
        {target && pending?.kind === 'delete' && (
          <form
            className="p-5"
            onSubmit={(e) => { e.preventDefault(); void confirmDelete(target) }}
          >
            <p className="text-sm text-black/70">
              Xoá {name(target)} cùng {target.words} từ đã lưu và lịch sử luyện tập. Chỉ khôi phục được
              từ bản sao lưu hằng đêm.
            </p>
            <label className="mt-4 block text-sm">
              Gõ <span className="font-mono">{confirmationFor(target)}</span> để xác nhận
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="rounded-lg border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={busy || typed.trim().toLowerCase() !== confirmationFor(target).toLowerCase()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
              >
                Xoá vĩnh viễn
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={pending?.kind === 'merge'}
        onClose={() => setPending(null)}
        title="Gộp tài khoản"
        titleId="admin-merge-title"
        widthClass="max-w-md"
      >
        {target && pending?.kind === 'merge' && (
          <form
            className="p-5"
            onSubmit={(e) => { e.preventDefault(); void confirmMerge(target) }}
          >
            <p className="text-sm text-black/70">
              Chuyển {target.words} từ đã lưu của {name(target)} sang tài khoản được chọn. Từ mà tài khoản
              đích đã có thì giữ nguyên ở tài khoản nguồn. Tài khoản nguồn không bị xoá.
            </p>
            <label className="mt-4 block text-sm">
              Tài khoản đích
              <select
                value={into}
                onChange={(e) => setInto(e.target.value)}
                className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm"
              >
                <option value="">Chọn tài khoản</option>
                {others.map((a) => (
                  <option key={a.id} value={a.id}>{name(a)} ({a.words} từ)</option>
                ))}
              </select>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="rounded-lg border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={busy || !into}
                className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                Gộp
              </button>
            </div>
          </form>
        )}
      </Modal>

      <NoticeBar notice={notice} onDismiss={dismiss} />
    </div>
  )
}
