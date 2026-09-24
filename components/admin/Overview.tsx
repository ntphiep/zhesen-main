import Link from 'next/link'
import { formatBytes, rowsOf, type Metrics } from '@/lib/admin/metrics'
import type { AlarmStatus, BackupStatus } from '@/lib/admin/aws'
import type { Probe } from '@/lib/admin/architecture'
import { LANGUAGES } from '@/lib/languages'
import { Figure, Section, ShareBar, Status, ago, num, when, type Tone } from '@/components/admin/Page'

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
    { label: 'Ứng dụng web', tone: 'ok', text: 'Vercel đang phục vụ trang này' },
    {
      label: 'Đăng nhập',
      tone: auth.ok ? 'ok' : 'bad',
      text: auth.ok ? `${auth.detail} trả lời sau ${auth.ms} ms` : `Không trả lời (${auth.detail})`,
    },
    {
      label: 'Database',
      tone: pg.connections / pg.maxConnections >= 0.8 ? 'warn' : 'ok',
      text: `Postgres ${pg.version}, ${pg.connections}/${pg.maxConnections} kết nối, khởi động ${ago(pg.startedAt, now)}`,
    },
  ]
  if (aws.state === 'ok') {
    const firing = aws.alarms.filter((a) => a.state === 'ALARM')
    checks.push(
      {
        label: 'Sao lưu',
        tone: dumpTone(aws.dump),
        text: aws.dump ? `Bản dump gần nhất ${ago(aws.dump.at, now)}` : 'Chưa có bản dump nào trên S3',
      },
      {
        label: 'Cảnh báo',
        tone: firing.length > 0 ? 'bad' : 'ok',
        text: firing.length > 0
          ? `Đang báo: ${firing.map((a) => a.name).join(', ')}`
          : `${aws.alarms.length} cảnh báo CloudWatch, không cái nào đang báo`,
      },
    )
  } else {
    const text = aws.state === 'off' ? 'Chưa cấu hình quyền đọc AWS' : `Không đọc được AWS (${aws.name})`
    checks.push({ label: 'Sao lưu', tone: 'idle', text }, { label: 'Cảnh báo', tone: 'idle', text })
  }
  return checks
}

export function SystemStrip({ checks }: { checks: SystemCheck[] }) {
  const worst = checks.some((c) => c.tone === 'bad') ? 'bad' : checks.some((c) => c.tone !== 'ok') ? 'warn' : 'ok'
  const headline = { ok: 'Mọi thành phần đang chạy bình thường.', warn: 'Hệ thống chạy, có mục cần xem.', bad: 'Có thành phần đang lỗi.' }[worst]
  return (
    <div className="mt-6 rounded-lg border border-black/10">
      <p className="border-b border-black/10 px-4 py-3 font-medium">
        <Status tone={worst}>{headline}</Status>
      </p>
      <ul className="divide-y divide-black/5">
        {checks.map((c) => (
          <li key={c.label} className="grid gap-x-4 px-4 py-2.5 text-sm sm:grid-cols-[9rem_1fr]">
            <span className="font-medium">{c.label}</span>
            <Status tone={c.tone}><span className="text-black/70">{c.text}</span></Status>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function PeopleSection({ m }: { m: Metrics }) {
  const words = rowsOf(m, 'public', 'user_words')
  return (
    <Section title="Người dùng" aside={<Link href="/admin/users" prefetch={false} className="hover:underline">Xem từng tài khoản</Link>}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure label="Tài khoản" value={num(m.accounts.total)} note={`${num(m.accounts.permanent)} có email, ${num(m.accounts.anonymous)} ẩn danh`} />
        <Figure label="Mới trong 7 ngày" value={num(m.accounts.new7d)} />
        <Figure label="Có luyện tập trong 7 ngày" value={num(m.active7d)} />
        <Figure label="Từ đã lưu vào sổ tay" value={words === null ? '–' : num(words)} />
      </div>
    </Section>
  )
}

export function DictionarySection({ m }: { m: Metrics }) {
  const entries = rowsOf(m, 'lex', 'entries') ?? 0
  const senses = rowsOf(m, 'lex', 'senses')
  return (
    <Section title="Từ điển" aside={m.lexUpdatedAt ? `Cập nhật lần cuối ${when(m.lexUpdatedAt)}` : undefined}>
      <div className="rounded-lg border border-black/10 px-4 py-4">
        <p className="text-sm text-black/60">
          <span className="text-2xl font-semibold text-black tabular-nums">{num(entries)}</span> mục từ
          {senses !== null && <>, {num(senses)} nghĩa</>}
        </p>
        <div className="mt-3">
          <ShareBar
            label="Mục từ theo ngôn ngữ"
            total={entries}
            parts={LANGUAGES.map((l) => ({ label: l.name, value: m.entriesByLang[l.code] ?? 0 }))}
          />
        </div>
      </div>
    </Section>
  )
}

export function CapacitySection({ m, diskPercent }: { m: Metrics; diskPercent: number | null }) {
  const tables = m.relationBytes
  const biggest = [...m.tables].sort((a, b) => b.bytes - a.bytes).slice(0, 5)
  return (
    <Section title="Dung lượng" aside={<Link href="/admin/data" prefetch={false} className="hover:underline">Xem mọi bảng</Link>}>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-black/10 px-4 py-4">
          <p className="text-sm text-black/60">
            Database <span className="text-2xl font-semibold text-black tabular-nums">{formatBytes(m.databaseBytes)}</span>
            {' '}trên ổ đĩa {formatBytes(VOLUME_BYTES)}
          </p>
          <div className="mt-3">
            <ShareBar
              label="Dung lượng database"
              total={m.databaseBytes}
              format={formatBytes}
              parts={[
                { label: 'Bảng và index Postgres', value: tables },
                { label: 'PGroonga', value: m.pgroongaBytes },
              ]}
            />
          </div>
          <p className="mt-3 text-sm text-black/60">
            PGroonga lưu index tìm kiếm trong file riêng mà Postgres không tính vào bảng nào, nên phần
            {' '}{formatBytes(m.pgroongaBytes)} này nằm ngoài danh sách bảng. {m.pgroongaIndexes} index PGroonga
            {m.pgroongaSurplus > 0
              ? `, ${m.pgroongaSurplus} bộ dữ liệu thừa của index đã bị thay; chạy vacuum lex.entries để dọn.`
              : ', không có bộ dữ liệu thừa.'}
          </p>
          {diskPercent !== null && (
            <p className="mt-2 text-sm text-black/60">
              Toàn bộ ổ đĩa đang dùng <span className="font-medium text-black tabular-nums">{diskPercent.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%</span>, theo CloudWatch.
            </p>
          )}
        </div>
        <div className="rounded-lg border border-black/10 px-4 py-3">
          <p className="text-sm font-medium">Năm bảng lớn nhất</p>
          <ul className="mt-2 divide-y divide-black/5 text-sm">
            {biggest.map((t) => (
              <li key={`${t.schema}.${t.name}`} className="flex items-baseline justify-between gap-3 py-1.5">
                <Link href={`/admin/data?table=${t.schema}.${t.name}`} prefetch={false} className="min-w-0 truncate font-mono text-xs hover:underline">
                  {t.schema}.{t.name}
                </Link>
                <span className="shrink-0 text-black/55 tabular-nums">{num(t.rows)} dòng · {formatBytes(t.bytes)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  )
}
