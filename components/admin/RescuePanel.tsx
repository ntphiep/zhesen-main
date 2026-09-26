'use client'
import { useEffect, useState, type FormEvent } from 'react'
import { z } from '@/lib/zod'
import { postAdmin } from '@/lib/admin/browser'
import { when } from '@/components/admin/Page'

const stateSchema = z.object({ state: z.string(), type: z.string().nullable(), launchedAt: z.string().nullable() })
type State = z.infer<typeof stateSchema>

const LABEL: Record<string, string> = {
  running: 'running', pending: 'pending', stopping: 'stopping', stopped: 'stopped',
}

/** The key form, then the instance state with one button. Nothing here calls Supabase. */
export function RescuePanel({ unlocked }: { unlocked: boolean }) {
  const [open, setOpen] = useState(unlocked)
  const [secret, setSecret] = useState('')
  const [state, setState] = useState<State | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function send(body: Record<string, string>) {
    setBusy(true)
    setError(null)
    const out = await postAdmin('/api/rescue', body)
    setBusy(false)
    if (!out.ok) {
      setError(out.message)
      if (out.message.startsWith('Rescue session')) setOpen(false)
      return
    }
    const s = stateSchema.safeParse(out.data)
    if (s.success) { setState(s.data); setOpen(true) }
  }

  useEffect(() => {
    if (!open) return
    const read = () => { if (document.visibilityState === 'visible') void send({ op: 'state' }) }
    read()
    const t = setInterval(read, 10_000)
    return () => clearInterval(t)
  }, [open])

  function unlock(e: FormEvent) {
    e.preventDefault()
    void send({ op: 'unlock', secret }).then(() => setSecret(''))
  }

  if (!open) {
    return (
      <form onSubmit={unlock} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span>Rescue key</span>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            autoComplete="off"
            className="rounded-lg border border-black/15 px-3 py-2 font-mono"
          />
        </label>
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <button type="submit" disabled={busy || !secret} className="self-start rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
          Unlock
        </button>
      </form>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-black/10 px-4 py-3">
        <div className="font-mono text-sm">zhesen-supabase</div>
        <div className="mt-1 text-lg font-semibold">{state ? LABEL[state.state] ?? state.state : 'Loading'}</div>
        {state?.launchedAt && <div className="text-xs text-black/50">{state.type}, last started {when(state.launchedAt)}</div>}
      </div>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || state?.state !== 'stopped'}
          onClick={() => void send({ op: 'start' })}
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Start instance
        </button>
        <button type="button" onClick={() => void send({ op: 'lock' }).then(() => { setOpen(false); setState(null) })} className="rounded-lg border border-black/15 px-4 py-2 text-sm font-medium">
          Lock
        </button>
      </div>
      <p className="text-sm text-black/60">
        State refreshes every 10 seconds; the instance and its containers take 1 to 2 minutes to come back up.
      </p>
    </div>
  )
}
