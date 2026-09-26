'use client'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Modal } from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import type { AdminOutcome } from '@/lib/admin/browser'

/**
 * The guard from #64 on the browser side: the target's name typed back, and when the
 * server answers `reauth`, the password once more. Signing in again with the same
 * address keeps the same account; it only renews the sign-in time the server checks.
 */
export function GuardDialog({
  open, title, children, target, actionLabel, run, onClose, onDone, reauthFirst = false,
}: {
  open: boolean
  title: string
  /** What the action does, said before it runs. */
  children: ReactNode
  /** The name to type back; null for an action that only needs the button. */
  target: string | null
  actionLabel: string
  run: (confirm: string | undefined) => Promise<AdminOutcome>
  onClose: () => void
  onDone: (data: unknown) => void
  /** Ask for the password straight away, when the server has already refused once. */
  reauthFirst?: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const [typed, setTyped] = useState('')
  const [password, setPassword] = useState('')
  const [reauth, setReauth] = useState(reauthFirst)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function close() {
    if (busy) return
    setTyped(''); setPassword(''); setReauth(false); setError(null)
    onClose()
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    if (reauth) {
      const { data } = await supabase.auth.getSession()
      const email = data.session?.user.email
      const signIn = email ? await supabase.auth.signInWithPassword({ email, password }) : null
      if (!signIn || signIn.error) {
        setError('Incorrect password, or the sign-in session expired.')
        setBusy(false)
        return
      }
    }
    const outcome = await run(target ? typed : undefined)
    setBusy(false)
    if (outcome.ok) {
      close()
      onDone(outcome.data)
    } else if (outcome.reauth) {
      setReauth(true)
      setError(reauth ? outcome.message : null)
    } else {
      setError(outcome.message)
    }
  }

  const ready = (!target || typed === target) && (!reauth || password.length > 0)
  return (
    <Modal open={open} onClose={close} title={title} titleId="guard-title" widthClass="max-w-md">
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4 p-5">
        <div className="text-sm text-black/70">{children}</div>
        {target && (
          <label className="flex flex-col gap-1 text-sm">
            <span>Type <code className="rounded bg-black/[0.06] px-1 font-mono">{target}</code> to confirm</span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="rounded-lg border border-black/15 px-3 py-2 font-mono"
            />
          </label>
        )}
        {reauth && (
          <label className="flex flex-col gap-1 text-sm">
            <span>Password <span className="text-black/50">· last sign-in was over 10 minutes ago</span></span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="rounded-lg border border-black/15 px-3 py-2"
            />
          </label>
        )}
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={close} disabled={busy} className="rounded-lg border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-40">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!ready || busy}
            className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? 'Running…' : actionLabel}
          </button>
        </div>
      </form>
    </Modal>
  )
}
