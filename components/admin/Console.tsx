'use client'
import { useEffect, useState } from 'react'
import { z } from '@/lib/zod'
import { postAdmin } from '@/lib/admin/browser'
import { formatBytes } from '@/lib/admin/metrics'
import { clock, num, when } from '@/components/admin/Page'
import { GuardDialog } from '@/components/admin/GuardDialog'

const INSTANCE_NAME = 'zhesen-supabase'
/** SSM keeps only the first 24,000 characters of each stream. */
const LIMIT_NOTE = 'Kết quả dài hơn 24.000 ký tự bị cắt, vì SSM chỉ trả về chừng đó.'

const runSchema = z.object({
  status: z.string(), exitCode: z.number(), stdout: z.string(), stderr: z.string(), truncated: z.boolean(), ms: z.number(),
  table: z.array(z.array(z.string())).nullable().optional(),
  db: z.string().optional(),
})
type Run = z.infer<typeof runSchema>

const tab = (on: boolean) => `rounded-md px-3 py-1 text-sm ${on ? 'bg-black text-white' : 'text-black/65 hover:bg-black/[0.05]'}`
const button = 'rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40'

function Output({ run, at }: { run: Run; at: Date }) {
  const ok = run.exitCode === 0
  const rows = run.table && run.table.length > 0 ? run.table : null
  return (
    <div className="mt-3">
      <p className={`text-xs tabular-nums ${ok ? 'text-black/55' : 'text-rose-700'}`}>
        {ok ? 'Chạy xong' : `Lỗi, mã thoát ${run.exitCode}`} lúc {clock(at)}, mất {num(Math.round(run.ms / 100) / 10)} giây
        {rows ? `, ${num(rows.length - 1)} dòng` : ''}.{run.truncated ? ` ${LIMIT_NOTE}` : ''}
      </p>
      {rows ? (
        <div className="mt-1.5 max-h-[28rem] overflow-auto rounded-lg border border-black/10">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-black/10 text-left">
                {rows[0].map((h, i) => <th key={i} className="px-3 py-1.5 font-mono text-xs font-medium text-black/60">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {rows.slice(1).map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j} className="px-3 py-1 align-top font-mono text-xs whitespace-pre-wrap break-all">{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : run.stdout && (
        <pre className="mt-1.5 max-h-[28rem] overflow-auto rounded-lg border border-black/10 bg-black/[0.03] p-3 font-mono text-xs whitespace-pre-wrap">{run.stdout}</pre>
      )}
      {run.stderr && (
        <pre className="mt-1.5 max-h-60 overflow-auto rounded-lg border border-rose-200 bg-rose-50 p-3 font-mono text-xs whitespace-pre-wrap text-rose-800">{run.stderr}</pre>
      )}
    </div>
  )
}

function useRun() {
  const [run, setRun] = useState<{ run: Run; at: Date } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const take = (data: unknown) => {
    const r = runSchema.safeParse(data)
    if (r.success) { setRun({ run: r.data, at: new Date() }); setError(null) } else setError('Máy chủ trả về dữ liệu không đúng dạng.')
  }
  return { run, error, setError, take }
}

/** SQL as supabase_admin. Read mode needs no guard because Postgres refuses the writes. */
export function SqlConsole() {
  const [mode, setMode] = useState<'read' | 'write'>('read')
  const [sql, setSql] = useState('select count(*) from lex.entries;')
  const [busy, setBusy] = useState(false)
  const [guard, setGuard] = useState<null | { reauthFirst: boolean }>(null)
  const { run, error, setError, take } = useRun()

  async function runRead() {
    setBusy(true)
    const out = await postAdmin('/api/admin/control', { action: 'sql', mode: 'read', sql })
    setBusy(false)
    if (out.ok) take(out.data)
    else if (out.reauth) setGuard({ reauthFirst: true })
    else setError(out.message)
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Chế độ" className="inline-flex gap-1 rounded-lg border border-black/10 p-1">
          <button type="button" role="radio" aria-checked={mode === 'read'} className={tab(mode === 'read')} onClick={() => setMode('read')}>Chỉ đọc</button>
          <button type="button" role="radio" aria-checked={mode === 'write'} className={tab(mode === 'write')} onClick={() => setMode('write')}>Được ghi</button>
        </div>
        <p className="text-sm text-black/60">
          {mode === 'read'
            ? 'Mọi giao dịch ở chế độ chỉ đọc, dừng sau 30 giây. Lệnh ghi bị Postgres từ chối. Lệnh psql bắt đầu bằng dấu \\ không chạy ở đây.'
            : 'Chạy đúng như gõ, dừng sau 2 phút. Cần gõ lại tên database và được ghi cả câu lệnh vào nhật ký.'}
        </p>
      </div>
      <textarea
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        rows={6}
        spellCheck={false}
        aria-label="Câu lệnh SQL"
        className="mt-3 w-full rounded-lg border border-black/15 px-3 py-2 font-mono text-sm"
      />
      <div className="mt-2 flex items-center gap-3">
        <button type="button" className={button} disabled={busy || !sql.trim()} onClick={() => (mode === 'read' ? void runRead() : setGuard({ reauthFirst: false }))}>
          {busy ? 'Đang chạy' : mode === 'read' ? 'Chạy' : 'Chạy và ghi'}
        </button>
        <span className="text-xs text-black/45">Chạy với vai trò supabase_admin trên database postgres.</span>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
      {run && <Output run={run.run} at={run.at} />}
      {guard && (
        <GuardDialog
          open
          reauthFirst={guard.reauthFirst}
          title={mode === 'write' ? 'Chạy SQL được ghi' : 'Chạy SQL chỉ đọc'}
          target={mode === 'write' ? 'postgres' : null}
          actionLabel="Chạy"
          run={(confirm) => postAdmin('/api/admin/control', { action: 'sql', mode, sql, confirm })}
          onClose={() => setGuard(null)}
          onDone={take}
        >
          <p>
            {mode === 'write'
              ? 'Câu lệnh chạy trên database production với quyền supabase_admin và không hoàn tác được. Nên chạy sao lưu trước ở trang Hạ tầng.'
              : 'SQL đọc được mọi dòng của database, kể cả bảng tài khoản, nên cũng cần một lần đăng nhập trong 10 phút gần nhất.'}
          </p>
          <pre className="mt-2 max-h-40 overflow-auto rounded bg-black/[0.04] p-2 font-mono text-xs whitespace-pre-wrap">{sql}</pre>
        </GuardDialog>
      )}
    </div>
  )
}

/** One shell command as root, with its output; not an interactive terminal. */
export function ShellConsole() {
  const [command, setCommand] = useState('docker ps --format "table {{.Names}}\\t{{.Status}}"')
  const [timeout, setTimeoutSeconds] = useState(60)
  const [guard, setGuard] = useState(false)
  const { run, error, take } = useRun()
  return (
    <div>
      <textarea
        value={command}
        onChange={(e) => setCommand(e.target.value)}
        rows={3}
        spellCheck={false}
        aria-label="Lệnh shell"
        className="w-full rounded-lg border border-black/15 px-3 py-2 font-mono text-sm"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" className={button} disabled={!command.trim()} onClick={() => setGuard(true)}>Chạy lệnh</button>
        <label className="flex items-center gap-2 text-sm text-black/60">
          Dừng sau
          <input type="number" min={5} max={240} value={timeout} onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
            className="w-20 rounded-lg border border-black/15 px-2 py-1 tabular-nums" />
          giây
        </label>
        <span className="text-xs text-black/45">Chạy bằng root qua SSM. Phiên tương tác vẫn dùng aws ssm start-session.</span>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
      {run && <Output run={run.run} at={run.at} />}
      <GuardDialog
        open={guard}
        title="Chạy lệnh trên máy chủ"
        target={INSTANCE_NAME}
        actionLabel="Chạy"
        run={(confirm) => postAdmin('/api/admin/control', { action: 'shell', command, confirm, timeout: Math.min(240, Math.max(5, timeout || 60)) })}
        onClose={() => setGuard(false)}
        onDone={take}
      >
        <p>Lệnh chạy bằng root trên máy chủ production. Nó được ghi vào nhật ký và gửi email.</p>
        <pre className="mt-2 max-h-40 overflow-auto rounded bg-black/[0.04] p-2 font-mono text-xs whitespace-pre-wrap">{command}</pre>
      </GuardDialog>
    </div>
  )
}

const statusSchema = z.object({ db: z.string(), state: z.enum(['running', 'done', 'failed', 'missing']), entries: z.number().nullable(), warnings: z.number(), tail: z.string() })
type RestoreStatus = z.infer<typeof statusSchema>

/** A dump restored into its own database, for reading. Production is never touched. */
export function RestorePanel({ dumps }: { dumps: { key: string; at: string; bytes: number }[] }) {
  const [key, setKey] = useState(dumps[0]?.key ?? '')
  const [guard, setGuard] = useState(false)
  const [db, setDb] = useState<string | null>(null)
  const [status, setStatus] = useState<RestoreStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!db || status?.state === 'done' || status?.state === 'failed') return
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/control?restore=${db}`, { cache: 'no-store' })
        const s = statusSchema.safeParse(await res.json())
        if (s.success) setStatus(s.data)
      } catch {
        setError('Mất kết nối khi đọc tiến độ.')
      }
    }, 10_000)
    return () => clearInterval(t)
  }, [db, status?.state])

  if (dumps.length === 0) return <p className="text-sm text-black/60">Chưa có bản dump nào trong bucket sao lưu.</p>
  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span>Bản dump</span>
          <select value={key} onChange={(e) => setKey(e.target.value)} className="rounded-lg border border-black/15 px-3 py-2 font-mono text-sm">
            {dumps.map((d) => <option key={d.key} value={d.key}>{when(d.at)}, {formatBytes(d.bytes)}</option>)}
          </select>
        </label>
        <button type="button" className={button} disabled={!key || (status?.state === 'running')} onClick={() => setGuard(true)}>Khôi phục ra database riêng</button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
      {db && (
        <div role="status" className="mt-3 rounded-lg border border-black/10 px-4 py-3 text-sm">
          <div>
            Database <code className="font-mono">{db}</code>:{' '}
            {!status || status.state === 'running' ? 'đang khôi phục, tiến độ đọc lại mỗi 10 giây'
              : status.state === 'done' ? `xong, lex.entries có ${num(status.entries ?? 0)} dòng${status.warnings ? `; pg_restore bỏ qua một số lỗi (mã ${status.warnings}), xem log dưới đây` : ''}`
                : status.state === 'failed' ? 'thất bại' : 'chưa thấy log'}
          </div>
          {status?.tail && <pre className="mt-1.5 max-h-48 overflow-auto font-mono text-xs whitespace-pre-wrap text-black/60">{status.tail}</pre>}
          {status?.state === 'done' && (
            <p className="mt-1.5 text-xs text-black/55">
              Đọc bằng lệnh shell{' '}
              <code className="font-mono">docker exec supabase-db psql -U supabase_admin -d {db} -c &quot;...&quot;</code>. Xoá khi xong bằng SQL được ghi{' '}
              <code className="font-mono">drop database {db};</code>
            </p>
          )}
        </div>
      )}
      <GuardDialog
        open={guard}
        title="Khôi phục bản dump"
        target={null}
        actionLabel="Khôi phục"
        run={() => postAdmin('/api/admin/control', { action: 'restore', key })}
        onClose={() => setGuard(false)}
        onDone={(data) => {
          const r = runSchema.safeParse(data)
          if (r.success && r.data.db) { setDb(r.data.db); setStatus(null) } else setError('Không bắt đầu được việc khôi phục.')
        }}
      >
        <p>
          Bản dump được tải từ S3 và khôi phục vào một database mới tên <code className="font-mono">restore_…</code> trên cùng máy chủ.
          Database production không bị động tới. Việc này mất vài phút và dùng thêm ổ đĩa cỡ bằng database hiện tại; tối đa 2 bản cùng lúc.
        </p>
      </GuardDialog>
    </div>
  )
}
