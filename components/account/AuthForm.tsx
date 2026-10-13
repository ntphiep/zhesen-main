'use client'
import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { LinkPending } from '@/components/ui/LinkPending'
import { Said, WarnGlyph } from './Said'
import s from './Account.module.css'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AUTH_FALLBACK } from '@/lib/auth/redirect'
import {
  MIN_PASSWORD,
  attachEmail,
  passwordProblem,
  registerWithPassword,
  signInWithPassword,
  type AuthOutcome,
} from '@/lib/auth/account'

type Mode = 'login' | 'register'
type Feedback = { tone: 'ok' | 'bad'; text: string } | null
type FieldErrors = { email?: string; password?: string }

/** A field's own problem, under the field and named by its `aria-describedby`. */
function FieldError({ id, text }: { id: string; text?: string }) {
  return text ? <p id={id} className={`${s.said} ${s.near}`}><WarnGlyph />{text}</p> : null
}

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
  next = AUTH_FALLBACK,
  notice,
}: {
  mode: Mode
  /** Words saved against this browser's anonymous account. */
  localWordCount?: number
  /** True when this browser already carries an anonymous account. */
  hasAnonymousSession?: boolean
  /** Where the browser goes once the session is live. Already confined to this site by
   *  `safeNext` in the page, and carried across the link to the other mode. */
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
  const [errors, setErrors] = useState<FieldErrors>({})
  const [shown, setShown] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  // Registering on a browser that already holds words is an upgrade of the
  // account that holds them, not a new account.
  const upgrading = mode === 'register' && hasAnonymousSession && localWordCount > 0
  const passwordField = mode === 'register' ? 'new-password' : 'current-password'
  const carry = next === AUTH_FALLBACK ? '' : `?next=${encodeURIComponent(next)}`

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
    // The form is `noValidate`: the browser's own validation bubble is English. Every
    // field is checked at once, so one submit names every problem.
    const found: FieldErrors = {
      // The field still runs the browser's email check; noValidate only hides its bubble.
      email: !address ? 'Nhập email.' : emailRef.current?.validity.typeMismatch ? 'Email không hợp lệ.' : undefined,
      password: !password ? 'Nhập mật khẩu.' : mode === 'register' ? passwordProblem(password) ?? undefined : undefined,
    }
    setErrors(found)
    if (found.email) return emailRef.current?.focus()
    if (found.password) return passwordRef.current?.focus()
    if (upgrading) return run(() => attachEmail(supabase, address, password))
    if (mode === 'register') return run(() => registerWithPassword(supabase, address, password))
    return run(() => signInWithPassword(supabase, address, password, localWordCount))
  }

  return (
    <div className={`${s.acc} ${s.card}`}>
      <h1 className={s.cardTitle}>
        {mode === 'register' ? (upgrading ? 'Hoàn tất tài khoản' : 'Tạo tài khoản') : 'Đăng nhập'}
      </h1>

      {upgrading && (
        <p className={s.cardLede} data-keep="">
          Tài khoản mới giữ nguyên {localWordCount} từ đã lưu trên trình duyệt này.
        </p>
      )}

      {notice && (
        <p role="alert" className={s.alert}>
          <WarnGlyph />
          {notice}
        </p>
      )}

      <form onSubmit={submit} noValidate className={s.form}>
        <div>
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
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? 'email-error' : undefined}
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErrors((v) => ({ ...v, email: undefined })) }}
              className={s.field}
            />
          </label>
          <FieldError id="email-error" text={errors.email} />
        </div>

        <div>
          {/* The hint, the error and the toggle sit outside the label: inside it, the
              field's accessible name becomes "Mật khẩu" plus their text. */}
          <div className={s.secret}>
            <label className={s.label}>
              <span>Mật khẩu</span>
              <input
                ref={passwordRef}
                id={passwordField}
                name={passwordField}
                type={shown ? 'text' : 'password'}
                required
                minLength={mode === 'register' ? MIN_PASSWORD : undefined}
                autoComplete={passwordField}
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={[mode === 'register' && 'password-hint', errors.password && 'password-error'].filter(Boolean).join(' ') || undefined}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setErrors((v) => ({ ...v, password: undefined })) }}
                className={s.field}
              />
            </label>
            <button
              type="button"
              aria-label="Hiện mật khẩu"
              aria-pressed={shown}
              aria-controls={passwordField}
              onClick={() => setShown((v) => !v)}
              className={s.reveal}
            >
              <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
                <circle cx="8" cy="8" r="2" />
                {shown && <path d="M2.5 13.5 13.5 2.5" />}
              </svg>
            </button>
          </div>
          {mode === 'register' && (
            <p id="password-hint" className={s.hint}>Ít nhất {MIN_PASSWORD} ký tự.</p>
          )}
          <FieldError id="password-error" text={errors.password} />
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
            Đã có tài khoản? <Link href={`/login${carry}`} prefetch={false}>Đăng nhập<span aria-hidden="true">→</span><LinkPending /></Link>
          </>
        ) : (
          <>
            Chưa có tài khoản? <Link href={`/register${carry}`} prefetch={false}>Tạo tài khoản<span aria-hidden="true">→</span><LinkPending /></Link>
          </>
        )}
      </p>
    </div>
  )
}
