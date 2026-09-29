import Link from 'next/link'
import { formatBytes, rowsOf, type Metrics } from '@/lib/admin/metrics'
import type { AlarmStatus, BackupStatus } from '@/lib/admin/aws'
import type { Probe } from '@/lib/admin/architecture'
import { LANGUAGES } from '@/lib/languages'
import { CARD, Figure, Status, ago, num, type Tone } from '@/components/admin/Page'

/** infra/terraform/variables.tf `root_volume_gb`. */
export const VOLUME_BYTES = 30 * 1024 ** 3

/** What the AWS read returned, or why there is nothing: not configured, or the error name. */
export type AwsView =
  | { state: 'ok'; alarms: AlarmStatus[]; dump: BackupStatus | null }
  | { state: 'off' }
  | { state: 'error'; name: string }

export interface SystemCheck {
  label: string
  tone: Tone
  text: string
}

/** A dump runs at 03:30 UTC each day, so one over 26 hours old means a night was missed. */
export function dumpTone(dump: BackupStatus | null): Tone {
  if (!dump) return 'bad'
  if (dump.ageHours <= 26) return 'ok'
  return dump.ageHours <= 50 ? 'warn' : 'bad'
}

export function systemChecks(m: Metrics, auth: Probe, aws: AwsView, now: number = Date.now()): SystemCheck[] {
  const pg = m.postgres
  const checks: SystemCheck[] = [
    { label: 'Web app', tone: 'ok', text: 'Served by Vercel' },
    {
      label: 'Auth',
      tone: auth.ok ? 'ok' : 'bad',
      text: auth.ok ? `${auth.detail} · ${auth.ms} ms` : `No answer (${auth.detail})`,
    },
    {
      label: 'Database',
      tone: pg.connections / pg.maxConnections >= 0.8 ? 'warn' : 'ok',
      text: `Postgres ${pg.version} · ${pg.connections}/${pg.maxConnections} connections · up ${ago(pg.startedAt, now).replace(' ago', '')}`,
    },
  ]
  if (aws.state === 'ok') {
    const firing = aws.alarms.filter((a) => a.state === 'ALARM')
    checks.push(
      {
        label: 'Backups',
        tone: dumpTone(aws.dump),
        text: aws.dump ? `Last dump ${ago(aws.dump.at, now)}` : 'No dump on S3',
      },
      {
        label: 'Alarms',
        tone: firing.length > 0 ? 'bad' : 'ok',
        text: firing.length > 0 ? `Firing: ${firing.map((a) => a.name).join(', ')}` : `${aws.alarms.length} alarms, none firing`,
      },
    )
  } else {
    const text = aws.state === 'off' ? 'AWS read not configured' : `AWS unreadable (${aws.name})`
    checks.push({ label: 'Backups', tone: 'idle', text }, { label: 'Alarms', tone: 'idle', text })
  }
  return checks
}

/** One tile per component, worst first in colour only; the words say the rest. */
export function SystemStrip({ checks }: { checks: SystemCheck[] }) {
  return (
    <ul className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {checks.map((c) => (
        <li key={c.label} className={`min-w-0 ${CARD} px-3 py-2`}>
          <div className="text-[11px] font-semibold tracking-wide text-(--zs-soft) uppercase">{c.label}</div>
          <div className="mt-0.5 text-sm"><Status tone={c.tone}><span className="text-(--zs-soft)">{c.text}</span></Status></div>
        </li>
      ))}
    </ul>
  )
}

const pct = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`

/** The numbers the owner asked for first: people, words, capacity and money. */
export function Kpis({ m, diskPercent, costMtd }: { m: Metrics; diskPercent: number | null; costMtd: number | null }) {
  const entries = rowsOf(m, 'lex', 'entries') ?? 0
  const words = rowsOf(m, 'public', 'user_words')
  const byLang = LANGUAGES.map((l) => `${l.code} ${num(m.entriesByLang[l.code] ?? 0)}`).join(' · ')
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <Figure label="Users" value={num(m.accounts.total)} note={`${num(m.accounts.permanent)} email · ${num(m.accounts.anonymous)} anonymous`} />
      <Figure label="Active, 7 d" value={num(m.active7d)} note={`${num(m.accounts.new7d)} new`} />
      <Figure label="Saved words" value={words === null ? '–' : num(words)} />
      <Figure label="Entries" value={num(entries)} note={byLang} />
      <Figure
        label="Database"
        value={formatBytes(m.databaseBytes)}
        note={`PGroonga ${formatBytes(m.pgroongaBytes)}${diskPercent !== null ? ` · disk ${pct(diskPercent)}` : ''}`}
      />
      <Figure label="AWS, month to date" value={costMtd === null ? '–' : `$${costMtd.toFixed(2)}`} note="before credits" />
    </div>
  )
}

/** Shown only when PGroonga holds replaced index data that a vacuum would free. */
export function VacuumNote({ m }: { m: Metrics }) {
  if (m.pgroongaSurplus === 0) return null
  return (
    <p className="mt-2 text-sm text-amber-800">
      PGroonga holds {m.pgroongaSurplus} surplus index datasets; run <code className="font-mono">vacuum lex.entries</code> from{' '}
      <Link href="/admin/database" prefetch={false} className="underline">Database</Link> to clean up.
    </p>
  )
}
