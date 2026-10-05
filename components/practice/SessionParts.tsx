import Link from 'next/link'
import type { ReactNode } from 'react'
import type { LangCode } from '@/lib/languages'
import type { TypedResult } from '@/lib/practice/typing'
import { GradeSyncWarning } from '@/components/practice/GradeSyncWarning'
import p from './Practice.module.css'

const ICON = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

export const CHECK = <svg {...ICON}><circle cx="12" cy="12" r="9.5" /><path d="m7.5 12.3 3 3 6-6.3" /></svg>
export const CROSS = <svg {...ICON}><circle cx="12" cy="12" r="9.5" /><path d="m9 9 6 6m0-6-6 6" /></svg>
export const NEAR = <svg {...ICON}><circle cx="12" cy="12" r="9.5" strokeDasharray="3 3" /><path d="M7.5 12.5c1.5-1.6 3-1.6 4.5 0s3 1.6 4.5 0" /></svg>
export const MIC = <svg {...ICON} strokeWidth={1.9}><rect x="8.5" y="3" width="7" height="11.5" rx="3.5" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg>

/** A word set in its own language's face. */
export function Hw({ text, lang, className }: { text: string; lang: LangCode; className?: string }) {
  return <span data-hw="" lang={lang} className={className}>{text}</span>
}

/** A session on its pastel band. */
export function Stage({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <main className={`${p.pr} ${p.stage} font-ui`}>
      <div className={p.col} data-wide={wide || undefined}>{children}</div>
    </main>
  )
}

/** Exit, the running count, and a line that fills as the session moves on. */
export function SessionBar({ label, done, total }: { label: string; done: number; total: number }) {
  const frac = total > 0 ? Math.min(1, done / total) : 0
  return (
    <>
      <div className={p.bar}>
        <Link href="/practice">← Thoát</Link>
        <span>{label}</span>
      </div>
      <div className={p.track} aria-hidden="true"><i style={{ transform: `scaleX(${frac})` }} /></div>
    </>
  )
}

/** What a typed or spoken answer earned, carried by an icon as well as the words. */
export function Verdict({ result, children }: { result: TypedResult; children: ReactNode }) {
  return (
    <p className={p.verdict} data-v={result}>
      {result === 'correct' ? CHECK : result === 'wrong' ? CROSS : NEAR}
      <span>{children}</span>
    </p>
  )
}

export function Loading() {
  return <Stage><p className={p.wait}>Đang tải…</p></Stage>
}

/** A session that cannot start, with the way back. */
export function Empty({ title, note }: { title: string; note?: string }) {
  return (
    <Stage>
      <div className={`${p.card} ${p.end}`}>
        <h1>{title}</h1>
        {note && <p>{note}</p>}
        <div className={p.row}><Link href="/practice" className={p.btn}>Về luyện tập</Link></div>
      </div>
    </Stage>
  )
}

/** The end of a round: the score and its meter, then play again or go back. */
export function Result({ score, total, note, failed, onAgain }: {
  score: number
  total: number
  note?: string
  failed: boolean
  onAgain: () => void
}) {
  return (
    <Stage>
      <div className={`${p.card} ${p.end}`}>
        <h1>Kết quả: {score}/{total}</h1>
        <div className={p.meter} aria-hidden="true"><i style={{ transform: `scaleX(${total ? score / total : 0})` }} /></div>
        {note && <p>{note}</p>}
        <GradeSyncWarning failed={failed} />
        <div className={p.row}>
          <button type="button" onClick={onAgain} className={p.btn}>Làm lại</button>
          <Link href="/practice" className={p.ghost}>Về luyện tập</Link>
        </div>
      </div>
    </Stage>
  )
}
