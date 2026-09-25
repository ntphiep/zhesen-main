import type { BackupStatus, Health } from '@/lib/admin/aws'
import { formatBytes } from '@/lib/admin/metrics'
import { STUDY_TIMEZONE } from '@/lib/wordlist/activity'

const STATE: Record<Health['alarms'][number]['state'], { label: string; tone: string }> = {
  OK: { label: 'OK', tone: 'bg-emerald-50 text-emerald-800' },
  ALARM: { label: 'ALARM', tone: 'bg-rose-50 text-rose-800' },
  INSUFFICIENT_DATA: { label: 'No data', tone: 'bg-black/5 text-black/60' },
}

const COMPARE: Record<string, string> = {
  GreaterThanThreshold: '>',
  GreaterThanOrEqualToThreshold: '≥',
  LessThanThreshold: '<',
  LessThanOrEqualToThreshold: '≤',
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', { timeZone: STUDY_TIMEZONE, dateStyle: 'short', timeStyle: 'short' })

const value = (n: number | null) => (n === null ? '–' : n.toLocaleString('en-US', { maximumFractionDigits: 1 }))

function Backup({ title, item, empty }: { title: string; item: BackupStatus | null; empty: string }) {
  return (
    <div className="rounded-xl border border-black/10 px-4 py-3">
      <h3 className="font-medium">{title}</h3>
      {item ? (
        <div className="mt-1 text-sm">
          <div className="text-2xl font-semibold">{item.ageHours.toLocaleString('en-US')} h ago</div>
          <div className="text-black/60">{when(item.at)}{item.bytes !== undefined ? ` · ${formatBytes(item.bytes)}` : ''}</div>
          <div className="mt-0.5 font-mono text-xs break-all text-black/40">{item.id}</div>
        </div>
      ) : (
        <p className="mt-1 text-sm text-black/60">{empty}</p>
      )}
    </div>
  )
}

/** CloudWatch alarms with their latest datapoint, and the age of the newest dump. */
export function HealthPanel({ health }: { health: Health }) {
  return (
    <div className="flex flex-col gap-6">
      <Backup title="Latest dump" item={health.dump} empty="No dump yet. bin/backup.sh runs at 03:30 UTC daily." />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-xs font-medium uppercase tracking-wide text-black/45">
              <th className="py-2 pr-4">Alarm</th>
              <th className="py-2 pr-4">State</th>
              <th className="py-2 pr-4 text-right">Latest</th>
              <th className="py-2 pr-4 text-right">Threshold</th>
              <th className="py-2">Changed</th>
            </tr>
          </thead>
          <tbody>
            {health.alarms.map((a) => (
              <tr key={a.name} className="border-b border-black/5">
                <td className="py-1.5 pr-4">
                  <div>{a.name}</div>
                  <div className="font-mono text-xs text-black/40">{a.metric}</div>
                </td>
                <td className="py-1.5 pr-4">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATE[a.state].tone}`}>{STATE[a.state].label}</span>
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums">{value(a.latest)}</td>
                <td className="py-1.5 pr-4 text-right tabular-nums">{COMPARE[a.comparison] ?? ''} {value(a.threshold)}</td>
                <td className="py-1.5 whitespace-nowrap">{a.updatedAt ? when(a.updatedAt) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
