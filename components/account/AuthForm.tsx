'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  MIN_PASSWORD,
  attachEmail,
  registerWithPassword,
  requestPasswordReset,
  signInByEmail,
  signInWithPassword,
  type AuthOutcome,
} from '@/lib/auth/account'

type Mode = 'login' | 'register'
type Feedback = { tone: 'ok' | 'bad'; text: string } | null

/**
 * The sign-in and sign-up form, one component because they differ by two fields
 * and a verb.
 *
 * The one unusual door is a browser still holding a legacy anonymous session
 * with words saved before the notebook required an account. Registering there
 * must NOT create a second account -- the words hang off the anonymous one and
 * nothing would move them -- so the form attaches the email to the account
 * already present. Supabase will not accept a password until that address is
 * confirmed, so the password step waits for `/account` after the emailed link.
 * https://supabase.com/docs/guides/auth/auth-anonymous
 *
 * `localWordCount` is read on the server by the page, because the guard has to
 * hold before the form is interactive, not after a round trip.
 */
export function AuthForm({
  mode,
  localWordCount = 0,
  hasAnonymousSession = false,
  next = '/wordlist',
  notice,
}: {
  mode: Mode
  /** Words saved against this browser's anonymous account. */
  localWordCount?: number
  /** True when this browser already carries an anonymous account. */
  hasAnonymousSession?: boolean
  /** Where the browser goes once the session is live. */
  next?: string
  /** Why the visitor was sent here, when something already went wrong -- an
   *  emailed link that had expired, for instance. Rendered above the form,
   *  separately from `feedback`, which belongs to this form's own submissions. */
  notice?: string
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  // Registering on a browser that already holds words is an upgrade of the
  // account that holds them, not a new account.
  const upgrading = mode === 'register' && hasAnonymousSession && localWordCount > 0

  async function run(action: () => Promise<AuthOutcome>) {
    if (busy) return
    setBusy(true)
    setFeedback(null)
    const outcome = await action()
    if (outcome.status === 'active') {
      router.push(next)
      router.refresh()
      return
    }
    setFeedback(
      outcome.status === 'sent'
        ? { tone: 'ok', text: `Đã gửi liên kết tới ${email.trim()}. Mở email và bấm vào liên kết đó.` }
        : { tone: 'bad', text: outcome.message },
    )
    setBusy(false)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const address = email.trim()
    if (!address) return
    if (upgrading) return run(() => attachEmail(supabase, address, '/account'))
    if (mode === 'register') return run(() => registerWithPassword(supabase, address, password, next))
    return run(() => signInWithPassword(supabase, address, password, localWordCount))
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-black/10 bg-white p-6 shadow-sm sm:p-7">
      <h1 className="text-2xl font-bold">
        {mode === 'register' ? (upgrading ? 'Hoàn tất tài khoản' : 'Tạo tài khoản') : 'Đăng nhập'}
      </h1>

      <p className="mt-2 text-sm text-black/60">
        {upgrading
          ? `${localWordCount} từ đã lưu trên trình duyệt này sẽ được gắn vào tài khoản của bạn, không có từ nào bị chuyển đi.`
          : mode === 'register'
            ? 'Miễn phí, và chỉ mất một phút.'
            : 'Chào mừng bạn quay lại.'}
      </p>

      {notice && (
        <p role="alert" className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {notice}
        </p>
      )}

      <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ban@vidu.com"
            className="rounded-lg border border-black/15 px-3 py-2"
          />
        </label>

        {/* Hidden while upgrading: Supabase refuses a password until the address
            is confirmed, so a box here would take a password it cannot store. */}
        {!upgrading && (
          <div className="flex flex-col gap-1 text-sm">
            {/* The hint sits outside the label on purpose: inside it, the
                accessible name of the field becomes "Mật khẩu" plus the hint,
                which is what a screen reader would then read out on focus. */}
            <label className="flex flex-col gap-1">
              <span className="font-medium">Mật khẩu</span>
              <input
                type="password"
                required
                minLength={mode === 'register' ? MIN_PASSWORD : undefined}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                aria-describedby={mode === 'register' ? 'password-hint' : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-lg border border-black/15 px-3 py-2"
              />
            </label>
            {mode === 'register' && (
              <p id="password-hint" className="text-xs text-black/50">Ít nhất {MIN_PASSWORD} ký tự.</p>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-1 rounded-lg bg-black px-4 py-2 font-medium text-white disabled:opacity-40"
        >
          {busy ? 'Đang xử lý…' : upgrading ? 'Gửi liên kết xác nhận' : mode === 'register' ? 'Tạo tài khoản' : 'Đăng nhập'}
        </button>
      </form>

      {feedback && (
        <p className={`mt-3 text-sm ${feedback.tone === 'ok' ? 'text-green-700' : 'text-red-600'}`}>
          {feedback.text}
        </p>
      )}

      {mode === 'login' && (
        <div className="mt-4 flex flex-col gap-2 text-sm">
          <button
            type="button"
            disabled={busy || !email.trim()}
            onClick={() => run(() => signInByEmail(supabase, email.trim(), localWordCount, next))}
            className="text-left text-black/60 hover:text-black hover:underline disabled:opacity-40"
          >
            Gửi liên kết đăng nhập, không cần mật khẩu
          </button>
          <button
            type="button"
            disabled={busy || !email.trim()}
            onClick={() => run(() => requestPasswordReset(supabase, email.trim()))}
            className="text-left text-black/60 hover:text-black hover:underline disabled:opacity-40"
          >
            Quên mật khẩu
          </button>
        </div>
      )}

      <p className="mt-6 text-sm text-black/60">
        {mode === 'register' ? (
          <>
            Đã có tài khoản? <Link href="/login" prefetch={false} className="font-medium text-black hover:underline">Đăng nhập</Link>
          </>
        ) : (
          <>
            Chưa có tài khoản? <Link href="/register" prefetch={false} className="font-medium text-black hover:underline">Tạo tài khoản</Link>
          </>
        )}
      </p>
    </div>
  )
}
