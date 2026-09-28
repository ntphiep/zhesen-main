import type { ReactNode } from 'react'
import { STUDY_TIMEZONE } from '@/lib/wordlist/activity'

/** Shared pieces of every admin page, so the console reads as one instrument. */

export type Tone = 'ok' | 'warn' | 'bad' | 'idle'

const DOT: Record<Tone, string> = {
  ok: 'bg-emerald-700',
  warn: 'bg-amber-700',
  bad: 'bg-rose-700',
  idle: 'bg-black/25',
}

const TEXT: Record<Tone, string> = {
  ok: 'text-emerald-800',
  warn: 'text-amber-800',
  bad: 'text-rose-700',
  idle: 'text-black/55',
}

export function clock(d: Date | string): string {
  return new Date(d).toLocaleTimeString('vi-VN', { timeZone: STUDY_TIMEZONE, hour12: false })
}

export function when(d: Date | string): string {
  return new Date(d).toLocaleString('vi-VN', { timeZone: STUDY_TIMEZONE, dateStyle: 'short', timeStyle: 'short' })
}

export const num = (n: number) => n.toLocaleString('en-US')

/** Minutes, hours or days since `iso`. */
export function ago(iso: string, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000))
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}

/** A status dot with its words beside it; the colour never carries meaning alone. */
export function Status({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${TEXT[tone]}`}>
      <span aria-hidden className={`size-2 shrink-0 rounded-full ${DOT[tone]}`} />
      {children}
    </span>
  )
}

/** Title, an optional line of purpose, and when the numbers on the page were read. */
export function PageHeader({ title, lead, readAt }: { title: string; lead?: string; readAt?: Date }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1 border-b border-black/10 pb-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {lead && <p className="mt-1 max-w-2xl text-sm text-black/60">{lead}</p>}
      </div>
      {readAt && (
        <p className="text-xs text-black/55 tabular-nums">Read at {clock(readAt)}</p>
      )}
    </header>
  )
}

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {aside && <div className="text-sm text-black/55">{aside}</div>}
      </div>
      {children}
    </section>
  )
}

/** One number with its label underneath and an optional line of context. */
export function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-black/10 px-4 py-3">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-sm text-black/60">{label}</div>
      {note && <div className="mt-0.5 text-xs text-black/55">{note}</div>}
    </div>
  )
}

/** A horizontal share bar. `parts` are drawn left to right in ink of falling strength. */
export function ShareBar({ parts, total, label, format = num }: {
  parts: { label: string; value: number }[]
  total: number
  label: string
  format?: (n: number) => string
}) {
  const shades = ['bg-black/75', 'bg-black/45', 'bg-black/25', 'bg-black/12']
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-black/[0.06]" role="img" aria-label={label}>
        {parts.map((p, i) => (
          <div key={p.label} className={shades[i % shades.length]} style={{ width: `${total > 0 ? (p.value / total) * 100 : 0}%` }} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {parts.map((p, i) => (
          <li key={p.label} className="flex items-center gap-1.5">
            <span aria-hidden className={`size-2.5 rounded-sm ${shades[i % shades.length]}`} />
            <span className="text-black/60">{p.label}</span>
            <span className="tabular-nums">{format(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
