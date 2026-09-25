import Link from 'next/link'
import type { Range, Series } from '@/lib/admin/aws'
import type { SlowQuery } from '@/lib/admin/monitor'
import { formatBytes } from '@/lib/admin/metrics'
import { clock, num, when } from '@/components/admin/Page'

const W = 300
const H = 80

function show(unit: Series['unit'], v: number): string {
  if (unit === '%') return `${v.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`
  if (unit === 'bytes') return formatBytes(v)
  return v.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

/** Percent charts keep a 0 to 100 scale so a quiet day does not look alarming. */
function scaleMax(s: Series): number {
  const peak = Math.max(0, ...s.points.map((p) => p.v))
  return s.unit === '%' ? 100 : peak > 0 ? peak * 1.1 : 1
}

export function Chart({ s, range }: { s: Series; range: Range }) {
  const last = s.points.at(-1)
  if (!last) {
    return (
      <figure className="rounded-lg border border-black/10 px-4 py-3">
        <figcaption className="text-sm text-black/60">{s.label}</figcaption>
        <p className="mt-2 text-sm text-black/45">No CloudWatch datapoints in this range.</p>
      </figure>
    )
  }
  const t0 = Date.parse(s.points[0].t)
  const span = Math.max(1, Date.parse(last.t) - t0)
  const max = scaleMax(s)
  const xy = s.points.map((p) => [((Date.parse(p.t) - t0) / span) * W, H - (p.v / max) * (H - 4)] as const)
  const line = xy.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const peak = s.points.reduce((a, b) => (b.v > a.v ? b : a))
  const per = s.unit === 'bytes' ? (range === '24h' ? ' / 5 min' : ' / 30 min') : ''
  const edge = range === '24h' ? (t: string) => clock(t).slice(0, 5) : when

  return (
    <figure className="min-w-0 rounded-lg border border-black/10 px-4 py-3">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm text-black/60">{s.label}</span>
        <span className="text-sm tabular-nums">
          <span className="font-semibold">{show(s.unit, last.v)}</span>
          <span className="text-black/45">{per} · peak {show(s.unit, peak.v)}</span>
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-2 h-20 w-full" role="img"
        aria-label={`${s.label}: now ${show(s.unit, last.v)}, peak ${show(s.unit, peak.v)} at ${when(peak.t)}`}>
        {s.unit === '%' && <line x1="0" x2={W} y1={H - 0.8 * (H - 4)} y2={H - 0.8 * (H - 4)} className="stroke-black/15" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
        <path d={`${line} L${W},${H} L0,${H} Z`} className="fill-black/[0.06]" />
        <path d={line} fill="none" className="stroke-black/70" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-xs text-black/40 tabular-nums">
        <span>{edge(s.points[0].t)}</span>
        {s.unit === '%' && <span>dashed line 80%</span>}
        <span>{edge(last.t)}</span>
      </div>
    </figure>
  )
}

export function RangeSwitch({ range }: { range: Range }) {
  const opt = (r: Range, label: string) => (
    <Link
      href={r === '24h' ? '/admin/monitor' : '/admin/monitor?range=7d'}
      prefetch={false}
      scroll={false}
      aria-current={range === r ? 'true' : undefined}
      className={`rounded-md px-3 py-1 ${range === r ? 'bg-black text-white' : 'text-black/65 hover:bg-black/[0.05]'}`}
    >
      {label}
    </Link>
  )
  return (
    <div className="inline-flex gap-1 rounded-lg border border-black/10 p-1 text-sm">
      {opt('24h', '24 h')}
      {opt('7d', '7 d')}
    </div>
  )
}

/** pg_stat_statements since its last reset, the statements with the most total time first. */
export function SlowQueries({ rows }: { rows: SlowQuery[] }) {
  if (rows.length === 0) return <p className="text-sm text-black/55">pg_stat_statements has no queries yet.</p>
  const total = rows.reduce((n, r) => n + r.totalMs, 0)
  return (
    <ol className="divide-y divide-black/5 rounded-lg border border-black/10">
      {rows.map((r, i) => (
        <li key={i} className="px-4 py-3">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-xs text-black/55 tabular-nums">
            <span className="text-sm font-medium text-black/85">{num(Math.round(r.totalMs / 1000))} s total</span>
            <span>{num(r.calls)} calls</span>
            <span>mean {r.meanMs.toLocaleString('en-US', { maximumFractionDigits: 1 })} ms</span>
            <span>max {num(Math.round(r.maxMs))} ms</span>
            <span>role {r.role}</span>
            {r.hitRatio !== null && r.hitRatio < 0.99 && <span className="text-amber-800">cache hit {Math.round(r.hitRatio * 100)}%</span>}
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-black/[0.05]" aria-hidden>
            <div className="h-full bg-black/40" style={{ width: `${total > 0 ? (r.totalMs / total) * 100 : 0}%` }} />
          </div>
          <code className="mt-1.5 block font-mono text-xs break-all text-black/70 line-clamp-3">{r.query}</code>
        </li>
      ))}
    </ol>
  )
}
