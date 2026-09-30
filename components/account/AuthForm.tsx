'use client'
import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { LinkPending } from '@/components/ui/LinkPending'
import { Said, WarnGlyph } from './Said'
import s from './Account.module.css'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  MIN_PASSWORD,
  attachEmail,
  registerWithPassword,
  signInWithPassword,
  type AuthOutcome,
} from '@/lib/auth/account'

type Mode = 'login' | 'register'
type Feedback = { tone: 'ok' | 'bad'; text: string } | null

/**
 * The sign-in and sign-up form; the two modes differ by two fields and a verb.
 *
 * On a browser still holding a legacy anonymous session with saved words,
 * registering must NOT create a second account: the words hang off the anonymous
 * one and nothing would move them, so the email and password are attached to the
 * account already present.
 * https://supabase.com/docs/guides/auth/auth-anonymous
 *
 * `localWordCount` is read on the server: the guard must hold before the form is
 * interactive, not after a round trip.
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
  /** Why the visitor was sent here. Rendered above the form, apart from `feedback`,
   *  which belongs to this form's own submissions. */
  notice?: string
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const emailRef = useRef<HTMLInputElement>(null)

  // Registering on a browser that already holds words is an upgrade of the
  // account that holds them, not a new account.
  const upgrading = mode === 'register' && hasAnonymousSession && localWordCount > 0
  const passwordField = mode === 'register' ? 'new-password' : 'current-password'

  async function run(action: () => Promise<AuthOutcome>) {
    if (busy) return
    setBusy(true)
    setFeedback(null)
    let outcome: AuthOutcome
    try {
      outcome = await action()
    } catch {
      // Without this every button stays disabled until a reload, with nothing to say why.
      setFeedback({ tone: 'bad', text: 'Chưa kết nối được. Thử lại.' })
      setBusy(false)
      return
    }
    if (outcome.status === 'active') {
      router.push(next)
      router.refresh()
      return
    }
    setFeedback({ tone: 'bad', text: outcome.message })
    setBusy(false)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const address = email.trim()
    // The form is `noValidate`: the browser's own validation bubble is English.
    if (!address) return setFeedback({ tone: 'bad', text: 'Nhập email.' })
    // The field still runs the browser's email check; noValidate only hides its bubble.
    if (emailRef.current?.validity.typeMismatch) return setFeedback({ tone: 'bad', text: 'Email không hợp lệ.' })
    if (!password) return setFeedback({ tone: 'bad', text: 'Nhập mật khẩu.' })
    if (upgrading) return run(() => attachEmail(supabase, address, password))
    if (mode === 'register') return run(() => registerWithPassword(supabase, address, password))
    return run(() => signInWithPassword(supabase, address, password, localWordCount))
  }

  return (
    <div className={`${s.acc} ${s.card}`}>
      <h1 className={s.cardTitle}>
        {mode === 'register' ? (upgrading ? 'Hoàn tất tài khoản' : 'Tạo tài khoản') : 'Đăng nhập'}
      </h1>

      <p className={s.cardLede} data-keep={upgrading || undefined}>
        {upgrading
          ? `Tài khoản mới giữ nguyên ${localWordCount} từ đã lưu trên trình duyệt này.`
          : mode === 'register'
            ? 'Miễn phí.'
            : 'Đăng nhập để mở sổ tay.'}
      </p>

      {notice && (
        <p role="alert" className={s.alert}>
          <WarnGlyph />
          {notice}
        </p>
      )}

      <form onSubmit={submit} noValidate className={s.form}>
        <label className={s.label}>
          <span>Email</span>
          <input
            ref={emailRef}
            id="email"
            name="email"
            type="email"
            required
            // Password managers pair a password with `username`, not `email`.
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ban@vidu.com"
            className={s.field}
          />
        </label>

        <div>
          {/* The hint sits outside the label: inside it, the field's accessible name
              becomes "Mật khẩu" plus the hint. */}
          <label className={s.label}>
            <span>Mật khẩu</span>
            <input
              id={passwordField}
              name={passwordField}
              type="password"
              required
              minLength={mode === 'register' ? MIN_PASSWORD : undefined}
              autoComplete={passwordField}
              aria-describedby={mode === 'register' ? 'password-hint' : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={s.field}
            />
          </label>
          {mode === 'register' && (
            <p id="password-hint" className={s.hint}>Ít nhất {MIN_PASSWORD} ký tự.</p>
          )}
        </div>

        <button type="submit" disabled={busy} className={`${s.btn} ${s.wide}`}>
          {busy && <span aria-hidden="true" className={s.spin} />}
          {busy ? 'Đang xử lý…' : upgrading ? 'Hoàn tất tài khoản' : mode === 'register' ? 'Tạo tài khoản' : 'Đăng nhập'}
        </button>
      </form>

      {feedback && <Said tone={feedback.tone} text={feedback.text} />}

      <p className={s.swap}>
        {mode === 'register' ? (
          <>
            Đã có tài khoản? <Link href="/login" prefetch={false}>Đăng nhập<span aria-hidden="true">→</span><LinkPending /></Link>
          </>
        ) : (
          <>
            Chưa có tài khoản? <Link href="/register" prefetch={false}>Tạo tài khoản<span aria-hidden="true">→</span><LinkPending /></Link>
          </>
        )}
      </p>
    </div>
  )
}
