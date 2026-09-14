'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { MIN_PASSWORD, setPassword, signOut } from '@/lib/auth/account'
import { setDisplayName, type Profile } from '@/lib/auth/profile'

type Feedback = { tone: 'ok' | 'bad'; text: string } | null

const ROLE_LABEL: Record<Profile['role'], string> = {
  learner: 'Người học',
  admin: 'Quản trị',
}

/**
 * Everything an account owner can change about their own account.
 *
 * The role is shown and not editable: RLS refuses an update that changes it, so
 * a control here would be a button that always fails. It is granted from the
 * database, on purpose.
 *
 * The password box is not "change password" -- it is also the second half of the
 * anonymous upgrade. A learner who attached an email to the account holding their
 * words arrives here from the emailed link with a confirmed address and no
 * password at all, and this is where they get one.
 */
export function AccountSettings({ email, profile }: { email: string; profile: Profile | null }) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [name, setName] = useState(profile?.displayName ?? '')
  const [password, setPasswordValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [nameFeedback, setNameFeedback] = useState<Feedback>(null)
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback>(null)

  async function saveName(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setNameFeedback(null)
    const outcome = await setDisplayName(supabase, name)
    setNameFeedback(outcome.ok ? { tone: 'ok', text: 'Đã lưu.' } : { tone: 'bad', text: outcome.message })
    setBusy(false)
    if (outcome.ok) router.refresh()
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setPasswordFeedback(null)
    const outcome = await setPassword(supabase, password)
    if (outcome.status === 'active') {
      setPasswordValue('')
      setPasswordFeedback({ tone: 'ok', text: 'Đã đặt mật khẩu mới.' })
    } else if (outcome.status === 'error') {
      setPasswordFeedback({ tone: 'bad', text: outcome.message })
    }
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-xl border border-black/10 px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-black/60">Đang đăng nhập</span>
          <span className="font-medium">{email}</span>
          <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-black/60">
            {ROLE_LABEL[profile?.role ?? 'learner']}
          </span>
          <button
            className="ml-auto text-black/60 hover:text-black hover:underline"
            onClick={async () => {
              await signOut(supabase)
              router.push('/')
              router.refresh()
            }}
          >
            Đăng xuất
          </button>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Tên hiển thị</h2>
        <form onSubmit={saveName} className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Để trống cũng được"
            aria-label="Tên hiển thị"
            className="min-w-56 flex-1 rounded-lg border border-black/15 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-40"
          >
            Lưu
          </button>
        </form>
        {nameFeedback && (
          <p className={`mt-2 text-sm ${nameFeedback.tone === 'ok' ? 'text-green-700' : 'text-red-600'}`}>
            {nameFeedback.text}
          </p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Mật khẩu</h2>
        <p className="mt-1 text-sm text-black/60">
          Đặt mật khẩu để lần sau đăng nhập không cần chờ email.
        </p>
        <form onSubmit={savePassword} className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="password"
            required
            minLength={MIN_PASSWORD}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPasswordValue(e.target.value)}
            placeholder={`Ít nhất ${MIN_PASSWORD} ký tự`}
            aria-label="Mật khẩu mới"
            className="min-w-56 flex-1 rounded-lg border border-black/15 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Đặt mật khẩu
          </button>
        </form>
        {passwordFeedback && (
          <p className={`mt-2 text-sm ${passwordFeedback.tone === 'ok' ? 'text-green-700' : 'text-red-600'}`}>
            {passwordFeedback.text}
          </p>
        )}
      </section>
    </div>
  )
}
