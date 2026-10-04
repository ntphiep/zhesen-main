import type { ReactNode } from 'react'
import { STUDY_TIMEZONE } from '@/lib/wordlist/activity'

/** Shared pieces of every admin page, so the console reads as one instrument. */

export type Tone = 'ok' | 'warn' | 'bad' | 'idle'

const DOT: Record<Tone, string> = {
  ok: 'bg-emerald-700',
  warn: 'bg-amber-700',
  bad: 'bg-rose-700',
  idle: 'bg-(--zs-soft)/35',
}

const TEXT: Record<Tone, string> = {
  ok: 'text-emerald-800',
  warn: 'text-amber-800',
  bad: 'text-rose-700',
  idle: 'text-(--zs-soft)',
}

/** A soft card: the home page's white tile with its edge and lift, on either scheme. */
export const CARD = 'rounded-xl border border-(--edge) bg-(--zs-bg) shadow-(--lift)'

const MOTION = 'transition-colors duration-150 ease-std motion-reduce:transition-none'

/** The blue primary button of the home page, and the outlined one beside it. */
export const PRIMARY = `rounded-full bg-(--zs-btn) px-4 py-1.5 text-sm font-semibold text-(--zs-btn-ink) enabled:hover:bg-(--zs-btn-hover) disabled:opacity-40 ${MOTION}`
export const BUTTON = `rounded-full border border-(--edge) bg-(--zs-bg) px-3.5 py-1.5 text-sm font-semibold enabled:hover:border-sea-400 enabled:hover:bg-(--tint-1) disabled:opacity-40 ${MOTION}`

/** A row of mutually exclusive options, drawn like components/ui/LayoutPicker.tsx. */
export const SEGMENTS = 'inline-flex flex-wrap gap-0.5 rounded-lg bg-(--zs-chip) p-0.5 text-sm'
export const segment = (on: boolean) =>
  `rounded-md px-3 py-1 ${MOTION} ${on ? 'bg-(--zs-btn) font-semibold text-(--zs-btn-ink) shadow-sm' : 'text-(--zs-soft) hover:bg-(--zs-bg)/60'}`

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

/** What a streamed section shows until its reads land. */
export function Loading() {
  return <p className="text-sm"><Status tone="idle">Loading</Status></p>
}

/** A read that failed, by its code (57014 is the statement timeout), never its message,
 *  which can carry SQL or ARNs. */
export function ReadFailed({ what, error }: { what: string; error: unknown }) {
  const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' && error.code
    ? error.code
    : error instanceof Error ? error.name : 'Error'
  return <p className="text-sm text-rose-700">Could not read {what} ({code}). Reload to try again.</p>
}

/** Title, an optional line of purpose, and when the numbers on the page were read. */
export function PageHeader({ title, lead, readAt }: { title: string; lead?: string; readAt?: Date }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1 border-b-[1.5px] border-(--zs-line) pb-4">
      <div className="min-w-0">
        <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-[-0.03em] text-(--zs-ink)">{title}</h1>
        {lead && <p className="mt-1 max-w-2xl text-sm text-(--zs-soft)">{lead}</p>}
      </div>
      {readAt && (
        <p className="text-xs text-(--zs-soft) tabular-nums">Read at {clock(readAt)}</p>
      )}
    </header>
  )
}

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold tracking-[-0.01em] text-(--zs-ink)">{title}</h2>
        {aside && <div className="text-sm text-(--zs-soft)">{aside}</div>}
      </div>
      {children}
    </section>
  )
}

/** One number with its label underneath and an optional line of context. */
export function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className={`min-w-0 px-4 py-3 ${CARD}`}>
      <div className="text-2xl font-extrabold tracking-[-0.02em] tabular-nums">{value}</div>
      <div className="text-sm text-(--zs-soft)">{label}</div>
      {note && <div className="mt-0.5 text-xs text-(--zs-soft)">{note}</div>}
    </div>
  )
}
