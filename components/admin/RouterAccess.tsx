'use client'
import { useEffect, useState } from 'react'
import { z } from '@/lib/zod'
import { postAdmin } from '@/lib/admin/browser'
import { GuardDialog } from '@/components/admin/GuardDialog'

const PATH = '/api/admin/router'

/** `POST /api/admin/router`. */
const openedSchema = z.object({ link: z.string().url(), password: z.string(), expiresIn: z.number() })
type Opened = z.infer<typeof openedSchema>

const button = 'rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/[0.04] disabled:opacity-40'

/** The password and a link that opens the dashboard in a new tab; both go away when the
 *  link expires. */
export function RouterAccess() {
  const [opened, setOpened] = useState<Opened | null>(null)
  const [reauth, setReauth] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!opened) return
    const t = setTimeout(() => setOpened(null), opened.expiresIn * 1000)
    return () => clearTimeout(t)
  }, [opened])

  function done(data: unknown) {
    const parsed = openedSchema.safeParse(data)
    if (parsed.success) setOpened(parsed.data)
    else setError('The answer could not be read.')
  }

  async function open() {
    setBusy(true)
    setError(null)
    const outcome = await postAdmin(PATH, {})
    setBusy(false)
    if (outcome.ok) done(outcome.data)
    else if (outcome.reauth) setReauth(true)
    else setError(outcome.message)
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      {opened ? (
        <div className="flex flex-col gap-3 rounded-lg border border-black/10 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">Password</span>
            <code className="min-w-0 flex-1 font-mono text-xs break-all">{opened.password}</code>
            <button type="button" className={button} onClick={() => void navigator.clipboard.writeText(opened.password)}>Copy</button>
          </div>
          <div>
            <a href={opened.link} target="_blank" rel="noreferrer" className={`${button} inline-block`}>Open the 9router dashboard</a>
          </div>
          <p className="text-xs text-black/50">
            The link works for {Math.round(opened.expiresIn / 60)} minutes and lets this browser in for 12 hours. 9router then asks for the password above.
          </p>
        </div>
      ) : (
        <div>
          <button type="button" className={button} disabled={busy} onClick={() => void open()}>{busy ? 'Opening…' : 'Open dashboard'}</button>
        </div>
      )}
      {error && <p role="alert" className="text-rose-700">{error}</p>}

      {reauth && (
        <GuardDialog
          open
          reauthFirst
          title="Open the 9router dashboard"
          target={null}
          actionLabel="Open"
          run={() => postAdmin(PATH, {})}
          onClose={() => setReauth(false)}
          onDone={done}
        >
          <p>The dashboard shows every provider login and key. An audit row and an alert record that it was opened.</p>
        </GuardDialog>
      )}
    </div>
  )
}
