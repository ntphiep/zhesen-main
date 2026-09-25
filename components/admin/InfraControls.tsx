'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { z } from '@/lib/zod'
import { usePoll } from '@/lib/hooks/usePoll'
import { postAdmin } from '@/lib/admin/browser'
import { LOG_SERVICES, parseHostResponse, type HostResponse } from '@/lib/admin/monitor'
import { formatBytes } from '@/lib/admin/metrics'
import { clock, num, when, Section, Status, type Tone } from '@/components/admin/Page'
import { GuardDialog } from '@/components/admin/GuardDialog'

const INSTANCE_NAME = 'zhesen-supabase'

/** `GET /api/admin/control?part=state` (lib/admin/control.ts instanceState). */
const stateSchema = z.union([
  z.object({ enabled: z.literal(false) }),
  z.object({
    id: z.string(), name: z.string().nullable(), state: z.string(), type: z.string().nullable(),
    vcpus: z.number().nullable(), memoryGb: z.number().nullable(), arch: z.string().nullable(), az: z.string().nullable(),
    privateIp: z.string().nullable(), privateDns: z.string().nullable(), amiId: z.string().nullable(), amiName: z.string().nullable(),
    volume: z.object({
      id: z.string(), sizeGb: z.number().nullable(), type: z.string().nullable(), iops: z.number().nullable(), throughput: z.number().nullable(),
    }).nullable(),
    launchedAt: z.string().nullable(),
  }),
])

/** `GET /api/admin/control?part=types` (lib/admin/control.ts typeOptions). */
const typesSchema = z.array(z.object({
  type: z.string(), vcpus: z.number().nullable(), memoryGb: z.number().nullable(),
  usdPerHour: z.number().nullable(), usdPerMonth: z.number().nullable(),
}))
type TypeOption = z.infer<typeof typesSchema>[number]

const resizedSchema = z.object({ from: z.string().nullable(), to: z.string(), ms: z.number() })

const shellSchema = z.object({
  status: z.string(), exitCode: z.number(), stdout: z.string(), stderr: z.string(), truncated: z.boolean(), ms: z.number(),
}).partial()

const TONE: Record<string, Tone> = {
  running: 'ok', pending: 'warn', stopping: 'warn', stopped: 'bad', 'shutting-down': 'bad', terminated: 'bad',
}

type Pending =
  | { kind: 'power'; op: 'start' | 'stop' | 'reboot' }
  | { kind: 'resize' }
  | { kind: 'restart'; service: (typeof LOG_SERVICES)[number] }
  | { kind: 'backup' }

const button = 'rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/[0.04] disabled:opacity-40'

const pct = (n: number) => `${Math.round(n)}%`
const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`

function duration(seconds: number): string {
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3600)
  return days > 0 ? `${days} d ${hours} h` : `${hours} h ${Math.floor((seconds % 3600) / 60)} min`
}

/** A share of 0 to 1 as a ring, the number in its middle. */
function Ring({ label, share, note }: { label: string; share: number | null; note?: string }) {
  const r = 34
  const c = 2 * Math.PI * r
  const s = share === null ? 0 : Math.min(1, Math.max(0, share))
  const tone = s >= 0.9 ? 'text-rose-700' : s >= 0.8 ? 'text-amber-700' : 'text-black/70'
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative size-20" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={share === null ? undefined : Math.round(s * 100)}>
        <svg viewBox="0 0 80 80" className="size-20 -rotate-90" aria-hidden>
          <circle cx="40" cy="40" r={r} fill="none" strokeWidth="7" stroke="currentColor" className="text-black/[0.08]" />
          {share !== null && (
            <circle cx="40" cy="40" r={r} fill="none" strokeWidth="7" stroke="currentColor" strokeLinecap="round"
              strokeDasharray={`${s * c} ${c}`} className={tone} />
          )}
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-base font-semibold tabular-nums">
          {share === null ? '–' : pct(s * 100)}
        </span>
      </div>
      <div className="text-sm text-black/60">{label}</div>
      {note && <div className="-mt-1 text-xs text-black/45 tabular-nums">{note}</div>}
    </div>
  )
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 py-1.5 sm:grid sm:grid-cols-[7rem_1fr]">
      <dt className="text-black/55">{term}</dt>
      <dd className="min-w-0 break-words tabular-nums">{children}</dd>
    </div>
  )
}

const spec = (t: { vcpus: number | null; memoryGb: number | null }) =>
  [t.vcpus !== null ? `${t.vcpus} vCPU` : null, t.memoryGb !== null ? `${num(t.memoryGb)} GB` : null].filter(Boolean).join(' · ')

/** The EC2 instance with its power and type controls, container restarts and an on-demand
 *  backup, each behind GuardDialog. */
export function InfraControls() {
  const poll = usePoll('/api/admin/control?part=state', 10_000, (raw) => stateSchema.parse(raw))
  const hostPoll = usePoll<HostResponse>('/api/admin/monitor?part=host', 30_000, parseHostResponse)
  const [pending, setPending] = useState<Pending | null>(null)
  const [result, setResult] = useState<{ title: string; at: Date; text: string } | null>(null)
  const [types, setTypes] = useState<TypeOption[] | 'error' | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)
  const [resizing, setResizing] = useState(false)

  useEffect(() => { void loadTypes() }, [])

  const s = poll.state === 'loading' ? undefined : poll.data
  if (s && 'enabled' in s) return <p className="text-sm text-black/60">Chưa cấu hình quyền AWS cho bản triển khai này (AWS_ROLE_ARN).</p>
  const state = s?.state
  const host = hostPoll.state === 'loading' ? undefined : hostPoll.data
  const h = host && !('enabled' in host) ? host : null

  async function loadTypes() {
    try {
      const res = await fetch('/api/admin/control?part=types', { cache: 'no-store' })
      setTypes(res.ok ? typesSchema.parse(await res.json()) : 'error')
    } catch {
      setTypes('error')
    }
  }

  function openResize() {
    setChosen(null)
    setPending({ kind: 'resize' })
    if (types === 'error') void loadTypes()
  }

  /** The instance is running before its containers are, so the result waits for this route,
   *  which answers only once auth and the database do. */
  async function awaitDatabase(title: string) {
    const started = Date.now()
    setResult({ title: `${title} · waiting for the database`, at: new Date(), text: '' })
    for (let n = 0; n < 60; n++) {
      await new Promise((done) => setTimeout(done, 5000))
      const ok = await fetch('/api/admin/control?part=state', { cache: 'no-store' }).then((res) => res.ok, () => false)
      if (ok) {
        setResult({ title: `${title} · database back after ${Math.round((Date.now() - started) / 1000)} s`, at: new Date(), text: '' })
        return
      }
    }
    setResult({ title: `${title} · database not back after 5 min`, at: new Date(), text: 'Xem Monitor hoặc dùng /rescue.' })
  }

  const dialog = pending && (() => {
    if (pending.kind === 'power') {
      const words = {
        start: { title: 'Start instance', label: 'Start', target: null, text: 'Instance bật trong 1 tới 2 phút, rồi các container tự chạy lại.' },
        stop: { title: 'Stop instance', label: 'Stop', target: INSTANCE_NAME, text: 'Database, đăng nhập và trang này ngừng hoạt động. Bật lại ở /rescue.' },
        reboot: { title: 'Reboot instance', label: 'Reboot', target: INSTANCE_NAME, text: 'Mọi container dừng khoảng 1 tới 2 phút rồi tự chạy lại.' },
      }[pending.op]
      return { ...words, body: { action: 'power', op: pending.op } }
    }
    if (pending.kind === 'resize') {
      return { title: 'Change instance type', label: 'Change type', target: INSTANCE_NAME, text: '', body: { action: 'resize', type: chosen } }
    }
    if (pending.kind === 'restart') {
      return {
        title: `Restart supabase-${pending.service}`,
        label: 'Restart',
        target: `supabase-${pending.service}`,
        text: pending.service === 'db'
          ? 'Postgres dừng vài giây; truy vấn đang chạy bị huỷ.'
          : 'Container dừng vài giây; yêu cầu tới nó trong lúc đó sẽ lỗi.',
        body: { action: 'restart', service: pending.service },
      }
    }
    return {
      title: 'Backup now',
      label: 'Backup now',
      target: null,
      text: 'Chạy script sao lưu hằng đêm, khoảng 1 phút, không gián đoạn người dùng.',
      body: { action: 'backup' },
    }
  })()

  const running = state === 'running'
  const monthly = (type: string) => {
    const usdPerMonth = Array.isArray(types) ? types.find((t) => t.type === type)?.usdPerMonth : null
    return usdPerMonth ? `~${usd(usdPerMonth)}/month` : null
  }
  const i = s && !('enabled' in s) ? s : null
  const cpu = h?.load && h.cpus ? h.load[0] / h.cpus : null
  return (
    <>
      <Section title="EC2">
        <div className="rounded-lg border border-black/10">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 px-4 py-3">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-sm font-medium">{i?.name ?? INSTANCE_NAME}</span>
              {i && <span className="font-mono text-xs text-black/45">{i.id}</span>}
              <span className="text-sm">{state ? <Status tone={TONE[state] ?? 'idle'}>{state}</Status> : <span className="text-black/45">reading</span>}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={button} disabled={state !== 'stopped'} onClick={() => setPending({ kind: 'power', op: 'start' })}>Start</button>
              <button type="button" className={button} disabled={!running} onClick={() => setPending({ kind: 'power', op: 'reboot' })}>Reboot</button>
              <button type="button" className={button} disabled={!running} onClick={() => void openResize()}>Change type</button>
              <button type="button" className={`${button} text-rose-700`} disabled={!running} onClick={() => setPending({ kind: 'power', op: 'stop' })}>Stop</button>
            </div>
          </div>
          <div className="grid gap-6 px-4 py-4 md:grid-cols-[auto_1fr]">
            <div className="flex justify-around gap-4 md:justify-start">
              <Ring label="CPU load" share={cpu} note={h?.load ? `${h.load[0].toFixed(2)} / ${h.cpus}` : undefined} />
              <Ring label="Memory" share={h?.memory ? (h.memory.total - h.memory.available) / h.memory.total : null}
                note={h?.memory ? `${formatBytes(h.memory.total - h.memory.available)} of ${formatBytes(h.memory.total)}` : undefined} />
              <Ring label="Disk" share={h?.disk ? h.disk.used / h.disk.size : null}
                note={h?.disk ? `${formatBytes(h.disk.used)} of ${formatBytes(h.disk.size)}` : undefined} />
            </div>
            <dl className="min-w-0 divide-y divide-black/5 text-sm">
              <Row term="Type">
                {i?.type ? <><span className="font-mono">{i.type}</span>{[spec(i), i.arch, monthly(i.type)].filter(Boolean).map((p) => ` · ${p}`)}</> : '–'}
              </Row>
              <Row term="Instance ID"><span className="font-mono">{i?.id ?? '–'}</span></Row>
              <Row term="AZ">{i?.az ?? '–'}</Row>
              <Row term="Private IP"><span className="font-mono">{i?.privateIp ?? '–'}</span></Row>
              <Row term="AMI">
                {i?.amiName ?? <span className="font-mono">{i?.amiId ?? '–'}</span>}
              </Row>
              <Row term="Volume">
                {i?.volume ? [
                  i.volume.sizeGb !== null ? `${i.volume.sizeGb} GB` : null,
                  i.volume.type,
                  i.volume.iops !== null ? `${num(i.volume.iops)} IOPS` : null,
                  i.volume.throughput !== null ? `${i.volume.throughput} MB/s` : null,
                ].filter(Boolean).join(' · ') || i.volume.id : '–'}
              </Row>
              <Row term="Launched">{i?.launchedAt ? when(i.launchedAt) : '–'}</Row>
              <Row term="Uptime">{h && h.uptimeSeconds !== null ? duration(h.uptimeSeconds) : '–'}</Row>
            </dl>
          </div>
          {(poll.state === 'error' || hostPoll.state === 'error') && (
            <p className="border-t border-black/10 px-4 py-2 text-xs text-rose-700">
              {poll.state === 'error' ? poll.message : hostPoll.state === 'error' ? hostPoll.message : ''}
            </p>
          )}
        </div>
        <p className="mt-2 text-xs text-black/50">Instance tắt thì trang này không mở được; bật lại ở /rescue.</p>
      </Section>

      <Section title="Containers">
        <ul className="divide-y divide-black/5 rounded-lg border border-black/10">
          {LOG_SERVICES.map((svc) => (
            <li key={svc} className="flex items-center justify-between gap-2 px-4 py-2">
              <span className="font-mono text-sm">supabase-{svc}</span>
              <button type="button" className={button} disabled={!running} onClick={() => setPending({ kind: 'restart', service: svc })}>
                Restart
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Backup">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/10 px-4 py-3">
          <p className="text-sm text-black/55">Daily at 10:30 ICT</p>
          <button type="button" className={button} disabled={!running} onClick={() => setPending({ kind: 'backup' })}>Backup now</button>
        </div>
      </Section>

      {result && (
        <div role="status" className="mt-4 rounded-lg border border-black/10 px-4 py-3">
          <div className="text-sm font-medium">{result.title}, {clock(result.at)}</div>
          {result.text && <pre className="mt-1.5 overflow-x-auto font-mono text-xs whitespace-pre-wrap text-black/70">{result.text}</pre>}
        </div>
      )}

      {dialog && (
        <GuardDialog
          open
          title={dialog.title}
          target={dialog.target}
          actionLabel={dialog.label}
          run={async (confirm) => {
            if (dialog.body.action === 'resize' && !chosen) return { ok: false, message: 'Chọn một instance type.' }
            setResizing(dialog.body.action === 'resize')
            try {
              return await postAdmin('/api/admin/control', { ...dialog.body, confirm })
            } finally {
              setResizing(false)
            }
          }}
          onClose={() => setPending(null)}
          onDone={(data) => {
            const resized = resizedSchema.safeParse(data)
            if (dialog.body.action === 'resize' && resized.success) {
              void awaitDatabase(`Type changed: ${resized.data.from ?? '?'} to ${resized.data.to} in ${Math.round(resized.data.ms / 1000)} s`)
              return
            }
            const r = shellSchema.safeParse(data)
            const text = r.success ? [r.data.stdout, r.data.stderr].filter(Boolean).join('\n').trim() : ''
            const failed = r.success && r.data.exitCode !== undefined && r.data.exitCode !== 0
            setResult({ title: `${dialog.title}: ${failed ? `failed, exit ${r.data.exitCode}` : dialog.body.action === 'power' ? 'requested' : 'done'}`, at: new Date(), text })
          }}
        >
          {pending.kind === 'resize' ? (
            <>
              {types === null && <p>Đang đọc giá.</p>}
              {types === 'error' && <p className="text-rose-700">Không đọc được danh sách instance type.</p>}
              {Array.isArray(types) && (
                <div role="radiogroup" aria-label="Instance type" className="grid grid-cols-2 gap-2">
                  {types.map((t) => {
                    const current = t.type === i?.type
                    return (
                      <label key={t.type}
                        className={`flex flex-col rounded-lg border px-3 py-2 ${current ? 'border-black/10 opacity-60' : 'cursor-pointer border-black/15 hover:bg-black/[0.03]'} has-[:checked]:border-black has-[:checked]:bg-black/[0.04]`}>
                        <input type="radio" name="instance-type" value={t.type} className="sr-only" disabled={current || resizing}
                          checked={chosen === t.type} onChange={() => setChosen(t.type)} />
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="font-mono text-sm font-medium text-black">{t.type}</span>
                          {current && <span className="text-xs text-black/50">current</span>}
                        </span>
                        <span className="text-xs text-black/60 tabular-nums">{spec(t) || '–'}</span>
                        <span className="text-xs text-black/60 tabular-nums">{t.usdPerMonth === null ? '–' : `~${usd(t.usdPerMonth)}/month`}</span>
                      </label>
                    )
                  })}
                </div>
              )}
              <p className="mt-3">Web app ngừng khoảng 2 tới 3 phút trong lúc instance tắt rồi bật lại.</p>
              {resizing && <p role="status" className="mt-2 text-black">Đang stop, đổi type rồi start. Đừng đóng trang.</p>}
            </>
          ) : (
            <p>{dialog.text}</p>
          )}
        </GuardDialog>
      )}
    </>
  )
}
