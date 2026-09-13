'use client'
import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { accountKind, attachEmail, signInByEmail } from '@/lib/auth/account'

type Feedback = { tone: 'ok' | 'bad'; text: string } | null

/**
 * The one place the learner can make the wordlist outlive this browser.
 *
 * Two different jobs behind one email box, chosen by what the browser already
 * holds, because getting them the wrong way round is how data is lost:
 *
 *   words here, no email  -> attach the email to THIS account (nothing moves)
 *   nothing here          -> sign in to an account that exists somewhere else
 *
 * Shown collapsed by default. A learner who never leaves this browser should not
 * be nagged, but one who has 400 words in a cookie deserves to be told what that
 * means, so the warning line appears once there is something to lose.
 */
export function AccountPanel({ wordCount }: { wordCount: number }) {
  const supabase = useMemo(() => createClient(), [])
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  useEffect(() => {
    let live = true
    supabase.auth.getUser().then(({ data }) => {
      if (!live) return
      setUser(data.user ?? null)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => { live = false; sub.subscription.unsubscribe() }
  }, [supabase])

  // Nothing useful to say before we know which account this is.
  if (!ready) return null

  const kind = accountKind(user)

  if (kind === 'permanent') {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-sm">
        <span className="text-black/60">Sổ tay đã gắn với</span>
        <span className="font-medium">{user?.email}</span>
        <button
          className="ml-auto text-black/50 hover:text-black hover:underline"
          onClick={async () => { await supabase.auth.signOut(); window.location.reload() }}
        >
          Đăng xuất
        </button>
      </div>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const address = email.trim()
    if (!address || busy) return
    setBusy(true)
    setFeedback(null)
    const outcome = kind === 'anonymous' && wordCount > 0
      ? await attachEmail(supabase, address)
      : await signInByEmail(supabase, address, wordCount)
    setFeedback(outcome.status === 'sent'
      ? { tone: 'ok', text: `Đã gửi liên kết xác nhận tới ${address}. Mở email và bấm vào liên kết đó.` }
      : { tone: 'bad', text: outcome.message })
    setBusy(false)
  }

  const atRisk = wordCount > 0

  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${atRisk ? 'border-amber-300 bg-amber-50' : 'border-black/10'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={atRisk ? 'text-amber-900' : 'text-black/60'}>
          {atRisk
            ? `${wordCount} từ đang chỉ nằm trong trình duyệt này. Xóa dữ liệu duyệt web là mất.`
            : 'Sổ tay đang gắn với trình duyệt này.'}
        </span>
        <button
          className="ml-auto font-medium text-black/70 hover:text-black hover:underline"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {atRisk ? 'Lưu bằng email' : 'Đăng nhập bằng email'}
        </button>
      </div>

      {open && (
        <form onSubmit={submit} className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ban@vidu.com"
            aria-label="Địa chỉ email"
            className="min-w-56 flex-1 rounded-lg border border-black/15 px-3 py-1.5"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-black px-3 py-1.5 font-medium text-white disabled:opacity-40"
          >
            {busy ? 'Đang gửi…' : 'Gửi liên kết'}
          </button>
        </form>
      )}

      {feedback && (
        <p className={`mt-2 ${feedback.tone === 'ok' ? 'text-green-700' : 'text-red-600'}`}>
          {feedback.text}
        </p>
      )}
    </div>
  )
}
