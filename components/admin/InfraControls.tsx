'use client'
import { useState } from 'react'
import { z } from '@/lib/zod'
import { usePoll } from '@/lib/hooks/usePoll'
import { postAdmin } from '@/lib/admin/browser'
import { LOG_SERVICES } from '@/lib/admin/monitor'
import { clock, when, Status, type Tone } from '@/components/admin/Page'
import { GuardDialog } from '@/components/admin/GuardDialog'

const INSTANCE_NAME = 'zhesen-supabase'

const stateSchema = z.union([
  z.object({ enabled: z.literal(false) }),
  z.object({ state: z.string(), type: z.string().nullable(), launchedAt: z.string().nullable(), privateDns: z.string().nullable() }),
])

const shellSchema = z.object({
  status: z.string(), exitCode: z.number(), stdout: z.string(), stderr: z.string(), truncated: z.boolean(), ms: z.number(),
}).partial()

const STATE: Record<string, { label: string; tone: Tone }> = {
  running: { label: 'Đang chạy', tone: 'ok' },
  pending: { label: 'Đang bật', tone: 'warn' },
  stopping: { label: 'Đang tắt', tone: 'warn' },
  stopped: { label: 'Đã tắt', tone: 'bad' },
  'shutting-down': { label: 'Đang huỷ', tone: 'bad' },
  terminated: { label: 'Đã huỷ', tone: 'bad' },
}

type Pending =
  | { kind: 'power'; op: 'start' | 'stop' | 'reboot' }
  | { kind: 'restart'; service: (typeof LOG_SERVICES)[number] }
  | { kind: 'backup' }

const button = 'rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/[0.04] disabled:opacity-40'

/** Instance power, container restarts and an on-demand backup, each behind GuardDialog. */
export function InfraControls() {
  const poll = usePoll('/api/admin/control?part=state', 10_000, (raw) => stateSchema.parse(raw))
  const [pending, setPending] = useState<Pending | null>(null)
  const [result, setResult] = useState<{ title: string; at: Date; text: string } | null>(null)

  const s = poll.state === 'loading' ? undefined : poll.data
  if (s && 'enabled' in s) return <p className="text-sm text-black/60">Chưa cấu hình quyền AWS cho bản triển khai này (AWS_ROLE_ARN).</p>
  const state = s?.state
  const st = state ? STATE[state] ?? { label: state, tone: 'idle' as Tone } : null

  const dialog = pending && (() => {
    if (pending.kind === 'power') {
      const words = {
        start: { title: 'Bật máy chủ', label: 'Bật máy', target: null, text: 'Máy chủ khởi động trong khoảng 1 tới 2 phút, rồi các container tự chạy lại. Từ lúc bật, AWS tính lại tiền giờ chạy.' },
        stop: { title: 'Tắt máy chủ', label: 'Tắt máy', target: INSTANCE_NAME, text: 'Database, đăng nhập và mọi trang cần tài khoản ngừng hoạt động, kể cả bảng điều khiển này. Trang từ điển đã cache vẫn trả lời. Ổ đĩa giữ nguyên và vẫn tính tiền lưu trữ. Để bật lại, mở /rescue với khoá cứu hộ.' },
        reboot: { title: 'Khởi động lại máy chủ', label: 'Khởi động lại', target: INSTANCE_NAME, text: 'Mọi container dừng khoảng 1 tới 2 phút rồi tự chạy lại. Người đang dùng sẽ gặp lỗi trong lúc đó.' },
      }[pending.op]
      return { ...words, body: { action: 'power', op: pending.op } }
    }
    if (pending.kind === 'restart') {
      return {
        title: `Khởi động lại supabase-${pending.service}`,
        label: 'Khởi động lại',
        target: `supabase-${pending.service}`,
        text: pending.service === 'db'
          ? 'Postgres dừng vài giây; mọi truy vấn đang chạy bị huỷ và mọi kết nối phải nối lại.'
          : 'Container dừng vài giây rồi chạy lại. Yêu cầu tới nó trong lúc đó sẽ lỗi.',
        body: { action: 'restart', service: pending.service },
      }
    }
    return {
      title: 'Sao lưu ngay',
      label: 'Chạy sao lưu',
      target: null,
      text: 'Chạy đúng script sao lưu hằng đêm: pg_dump toàn bộ database rồi đưa lên S3. Mất khoảng 1 phút và không làm gián đoạn người dùng.',
      body: { action: 'backup' },
    }
  })()

  const busy = state === 'pending' || state === 'stopping'
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-black/10 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-mono text-sm">{INSTANCE_NAME}</div>
            <div className="mt-1 text-lg font-semibold">{st ? <Status tone={st.tone}>{st.label}</Status> : 'Đang đọc'}</div>
            {s && !('enabled' in s) && (
              <div className="mt-0.5 text-xs text-black/50">
                {s.type}{s.launchedAt ? `, bật lần gần nhất ${when(s.launchedAt)}` : ''}
              </div>
            )}
            {poll.state === 'error' && <div className="mt-1 text-xs text-rose-700">{poll.message}</div>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button} disabled={state !== 'stopped'} onClick={() => setPending({ kind: 'power', op: 'start' })}>Bật máy</button>
            <button type="button" className={button} disabled={state !== 'running'} onClick={() => setPending({ kind: 'power', op: 'reboot' })}>Khởi động lại</button>
            <button type="button" className={`${button} text-rose-700`} disabled={state !== 'running'} onClick={() => setPending({ kind: 'power', op: 'stop' })}>Tắt máy</button>
          </div>
        </div>
        {busy && <p className="mt-2 text-xs text-black/55">Trạng thái đọc lại mỗi 10 giây cho tới khi máy chuyển xong.</p>}
      </div>

      <div className="rounded-lg border border-black/10 px-4 py-3">
        <h3 className="text-sm font-medium">Container</h3>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {LOG_SERVICES.map((svc) => (
            <li key={svc} className="flex items-center justify-between gap-2 rounded-md bg-black/[0.03] px-3 py-2">
              <span className="font-mono text-sm">supabase-{svc}</span>
              <button type="button" className={button} disabled={state !== 'running'} onClick={() => setPending({ kind: 'restart', service: svc })}>
                Khởi động lại
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/10 px-4 py-3">
        <div>
          <h3 className="text-sm font-medium">Sao lưu</h3>
          <p className="text-sm text-black/60">Bản tự động chạy lúc 10:30 mỗi ngày. Chạy thêm một bản trước khi sửa dữ liệu lớn.</p>
        </div>
        <button type="button" className={button} disabled={state !== 'running'} onClick={() => setPending({ kind: 'backup' })}>Sao lưu ngay</button>
      </div>

      {result && (
        <div role="status" className="rounded-lg border border-black/10 px-4 py-3">
          <div className="text-sm font-medium">{result.title}, lúc {clock(result.at)}</div>
          {result.text && <pre className="mt-1.5 overflow-x-auto font-mono text-xs whitespace-pre-wrap text-black/70">{result.text}</pre>}
        </div>
      )}

      {dialog && (
        <GuardDialog
          open
          title={dialog.title}
          target={dialog.target}
          actionLabel={dialog.label}
          run={(confirm) => postAdmin('/api/admin/control', { ...dialog.body, confirm })}
          onClose={() => setPending(null)}
          onDone={(data) => {
            const r = shellSchema.safeParse(data)
            const text = r.success ? [r.data.stdout, r.data.stderr].filter(Boolean).join('\n').trim() : ''
            const failed = r.success && r.data.exitCode !== undefined && r.data.exitCode !== 0
            setResult({ title: `${dialog.title}: ${failed ? `lỗi, mã thoát ${r.data.exitCode}` : dialog.body.action === 'power' ? 'đã gửi yêu cầu tới AWS' : 'xong'}`, at: new Date(), text })
          }}
        >
          <p>{dialog.text}</p>
          <p className="mt-2 text-xs text-black/50">Thao tác được ghi vào nhật ký và gửi email cho chủ dự án.</p>
        </GuardDialog>
      )}
    </div>
  )
}
