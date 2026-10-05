'use client'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SaveOutcome } from '@/lib/auth/profile'
import { deviceKeys, pushSupport, registerWorker, subscribe, type PushSupport } from '@/lib/push/browser'
import {
  REMINDER_HOURS, TURN_ON_FAILED, refreshDevice, setReminderHour, turnOffReminder, turnOnReminder,
  type Reminder,
} from '@/lib/push/reminders'
import { Said } from './Said'
import s from './Account.module.css'

type Feedback = { tone: 'ok' | 'bad'; text: string } | null

const HOURS = Array.from({ length: REMINDER_HOURS.last - REMINDER_HOURS.first + 1 }, (_, i) => REMINDER_HOURS.first + i)

const LIMITS: Partial<Record<PushSupport, string>> = {
  install: 'Thêm Zhesen vào Màn hình chính để bật nhắc.',
  blocked: 'Trình duyệt đang chặn thông báo. Cho phép thông báo trong cài đặt trình duyệt.',
  none: 'Trình duyệt này không hỗ trợ thông báo.',
}

const noSubscription = () => () => {}
/** Read on every render, so a permission refused in the prompt shows at once. */
const browserSupport = (): PushSupport | null => pushSupport()
const serverSupport = (): PushSupport | null => null
const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/** The daily review reminder on /account. Rendered only when the deployment has a VAPID key. */
export function ReminderPanel({ publicKey, userId, current }: {
  publicKey: string
  userId: string
  current: Reminder | null
}) {
  const supabase = useMemo(() => createClient(), [])
  const support = useSyncExternalStore(noSubscription, browserSupport, serverSupport)
  const registration = useRef<ServiceWorkerRegistration | null>(null)
  const [on, setOn] = useState(current !== null)
  const [hour, setHour] = useState<number>(current?.hour ?? REMINDER_HOURS.fallback)
  // Whether this browser holds a subscription: reminders can be on for another device only.
  const [device, setDevice] = useState<'checking' | 'here' | 'missing'>('checking')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const wasOn = current !== null

  useEffect(() => {
    if (support !== 'ok') return
    let live = true
    registerWorker()
      .then(async (reg) => {
        registration.current = reg
        const existing = await reg.pushManager.getSubscription()
        // Picks up keys the browser rotated since the last visit.
        if (existing && wasOn) void refreshDevice(supabase, deviceKeys(existing))
        if (live) setDevice(existing ? 'here' : 'missing')
      })
      .catch(() => { if (live) setDevice('missing') })
    return () => { live = false }
  }, [support, supabase, wasOn])

  function turnOn() {
    const reg = registration.current
    if (busy) return
    if (!reg) {
      setFeedback({ tone: 'bad', text: TURN_ON_FAILED })
      return
    }
    // Before any await: Safari asks for permission only from inside the click.
    void finishTurnOn(subscribe(reg, publicKey))
  }

  async function finishTurnOn(pending: Promise<PushSubscription>) {
    setBusy(true)
    setFeedback(null)
    let outcome: SaveOutcome = { ok: false, message: TURN_ON_FAILED }
    try {
      outcome = await turnOnReminder(supabase, deviceKeys(await pending), hour, timeZone())
    } catch {
      // A refused prompt rejects here; the blocked line below says what to do.
    }
    if (outcome.ok) {
      setOn(true)
      setDevice('here')
      setFeedback({ tone: 'ok', text: 'Đã bật nhắc.' })
    } else if (pushSupport() !== 'blocked') {
      setFeedback({ tone: 'bad', text: outcome.message })
    }
    setBusy(false)
  }

  async function changeHour(next: number) {
    setHour(next)
    if (!on) return
    setBusy(true)
    setFeedback(null)
    const outcome = await setReminderHour(supabase, next, timeZone())
    setFeedback(outcome.ok ? { tone: 'ok', text: 'Đã lưu.' } : { tone: 'bad', text: outcome.message })
    setBusy(false)
  }

  async function turnOff() {
    if (busy) return
    setBusy(true)
    setFeedback(null)
    const outcome = await turnOffReminder(supabase, userId)
    if (outcome.ok) {
      try {
        await (await registration.current?.pushManager.getSubscription())?.unsubscribe()
      } catch {
        // The rows are gone, so the sender has nothing left to reach this browser with.
      }
      setOn(false)
      setDevice('missing')
      setFeedback({ tone: 'ok', text: 'Đã tắt nhắc.' })
    } else {
      setFeedback({ tone: 'bad', text: outcome.message })
    }
    setBusy(false)
  }

  // Before hydration the controls draw disabled, so the panel keeps its height.
  const capable = support === null || support === 'ok'
  const limit = support ? LIMITS[support] : undefined

  return (
    <section className={s.panel} data-m="remind" data-i="7">
      <h2>Nhắc ôn</h2>
      <p>Nhận một thông báo mỗi ngày khi có từ đến hạn ôn.</p>
      {(capable || on) && (
        <div className={s.row}>
          <select
            value={hour}
            onChange={(e) => void changeHour(Number(e.target.value))}
            disabled={busy || support === null}
            aria-label="Giờ nhắc"
            className={`${s.field} ${s.hour}`}
          >
            {HOURS.map((h) => <option key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>)}
          </select>
          {on && capable && device === 'missing' && (
            <button type="button" onClick={turnOn} disabled={busy} className={s.btn}>
              Bật trên thiết bị này
            </button>
          )}
          {on ? (
            <button type="button" onClick={() => void turnOff()} disabled={busy || support === null} className={s.ghost}>
              Tắt nhắc
            </button>
          ) : (
            <button type="button" onClick={turnOn} disabled={busy || device === 'checking'} className={s.btn}>
              Bật nhắc
            </button>
          )}
        </div>
      )}
      {limit && <Said tone="bad" text={limit} />}
      {feedback && <Said tone={feedback.tone} text={feedback.text} />}
    </section>
  )
}
