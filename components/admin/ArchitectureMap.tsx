import type { ReactNode } from 'react'
import { CONTAINERS, PLACEMENT, STACK } from '@/lib/admin/architecture'
import { Status, type Tone } from '@/components/admin/Page'

export interface Live {
  tone: Tone
  text: string
}

export interface MapState {
  edgeHost: string
  deployment: { env: string; region: string | null; commit: string | null; node: string }
  /** The request this page made through CloudFront to GoTrue. */
  auth: Live & { version: string | null }
  /** The admin.metrics() call this page made through PostgREST to Postgres. */
  database: Live & { version: string | null }
  backups: Live
  alarms: Live
  integrations: { label: string; enabled: boolean }[]
  bucket: string | null
}

function Node({ place, name, children, live }: { place: string; name: string; children: ReactNode; live?: Live }) {
  return (
    <div className="flex min-w-0 flex-col rounded-lg border border-black/10 bg-white px-4 py-3">
      <div className="text-xs text-black/45">{place}</div>
      <div className="mt-0.5 font-semibold">{name}</div>
      <div className="mt-1 flex-1 text-sm text-black/60">{children}</div>
      {live && <div className="mt-2 text-sm"><Status tone={live.tone}>{live.text}</Status></div>}
    </div>
  )
}

/** A line between two stages: vertical on a phone, horizontal once the stages sit in a row. */
function Wire({ label }: { label: string }) {
  return (
    <div aria-hidden className="flex items-center justify-center gap-2 py-1 lg:mt-16 lg:flex-col lg:gap-1 lg:py-0">
      <span className="h-5 w-px bg-black/25 lg:h-px lg:w-full" />
      <span className="text-[11px] text-black/40 lg:whitespace-nowrap">{label}</span>
      <span className="h-5 w-px bg-black/25 lg:hidden" />
    </div>
  )
}

function containerLive(service: string, s: MapState): Live {
  if (service === 'db' || service === 'rest') return s.database
  if (service === 'auth' || service === 'api-gw') return s.auth
  return { tone: 'idle', text: 'Không đo được từ đây' }
}

/**
 * The path a request takes, left to right, with the live state of each stage as this page
 * measured it, and the services around the path underneath.
 */
export function ArchitectureMap({ s }: { s: MapState }) {
  const d = s.deployment
  return (
    <div>
      <div className="grid lg:grid-cols-[minmax(0,0.8fr)_3.5rem_minmax(0,1fr)_3.5rem_minmax(0,1fr)_3.5rem_minmax(0,1.6fr)] lg:items-start">
        <Node place="Máy của người học" name="Trình duyệt">
          Tải trang từ Vercel. Phiên đăng nhập nằm trong cookie của trình duyệt.
        </Node>
        <Wire label="HTTPS" />
        <Node
          place={`Vercel · ${PLACEMENT.vercelRegion} (${PLACEMENT.awsRegionName})`}
          name="Ứng dụng Next.js"
          live={{ tone: 'ok', text: `Đang phục vụ${d.commit ? `, commit ${d.commit}` : ''}` }}
        >
          Dựng trang, gọi API và giữ cache từ điển 7 ngày. Môi trường {d.env}{d.region ? `, function chạy ở ${d.region}` : ''}.
        </Node>
        <Wire label="API" />
        <Node place="AWS CloudFront" name="Cổng vào database" live={s.auth}>
          <span className="font-mono text-xs break-all">{s.edgeHost}</span>
          <br />Chỉ cho qua /auth/v1 và /rest/v1, còn lại bị chặn.
        </Node>
        <Wire label="HTTP" />
        <div className="min-w-0 rounded-lg border border-black/25 px-4 py-3">
          <div className="text-xs text-black/45">AWS EC2 · {PLACEMENT.awsRegion} ({PLACEMENT.awsRegionName})</div>
          <div className="mt-0.5 font-semibold">Supabase tự vận hành</div>
          <p className="mt-1 text-sm text-black/60">Một máy {PLACEMENT.instanceType} (2 vCPU, 4 GB) chạy 6 container Docker.</p>
          <ul className="mt-2 divide-y divide-black/5 border-t border-black/10">
            {CONTAINERS.map((c) => {
              const live = containerLive(c.service, s)
              return (
                <li key={c.container} className="py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-mono text-xs font-medium">{c.container}</span>
                    <span className="text-xs"><Status tone={live.tone}>{live.tone === 'idle' ? live.text : live.tone === 'ok' ? 'Đang chạy' : 'Lỗi'}</Status></span>
                  </div>
                  <div className="text-xs text-black/55">{c.role}</div>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      <h2 className="mt-10 mb-3 text-base font-semibold">Dịch vụ quanh hệ thống</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Node place={`AWS S3 · ${PLACEMENT.awsRegion}`} name="Bản dump database" live={s.backups}>
          pg_dump chạy lúc 03:30 UTC mỗi ngày từ máy EC2.
          {s.bucket && <><br /><span className="font-mono text-xs break-all">{s.bucket}</span></>}
        </Node>
        <Node place="AWS CloudWatch và SNS" name="Cảnh báo" live={s.alarms}>
          Theo dõi CPU, bộ nhớ, ổ đĩa và trạng thái máy; gửi email khi vượt ngưỡng.
        </Node>
        <Node
          place="Supabase Cloud"
          name="Bản sao đóng băng"
          live={{ tone: 'idle', text: `Giữ đến ${new Date(`${PLACEMENT.cloudCopyUntil}T12:00:00Z`).toLocaleDateString('vi-VN')}` }}
        >
          Dự án <span className="font-mono text-xs">{PLACEMENT.cloudCopyRef}</span>, dữ liệu trước ngày chuyển sang EC2. Chỉ dùng để quay lại nếu cần.
        </Node>
        {s.integrations.map((i) => (
          <Node
            key={i.label}
            place="Dịch vụ ngoài"
            name={i.label}
            live={{ tone: i.enabled ? 'ok' : 'idle', text: i.enabled ? 'Đã cấu hình' : 'Chưa cấu hình' }}
          >
            {INTEGRATION_ROLE[i.label] ?? ''}
          </Node>
        ))}
        <Node place="GitHub Actions" name="CI và deploy">
          Mỗi lần push lên master: lint, typecheck, test, rồi deploy lên Vercel.
        </Node>
      </div>
    </div>
  )
}

const INTEGRATION_ROLE: Record<string, string> = {
  'Trợ lý AI': 'Giải thích từ và câu qua POST /api/ai; khoá chỉ nằm trên server.',
  'Azure AI Translator': 'Dịch đoạn văn trong ô tra cứu, một request cho mọi ngôn ngữ đích.',
  'Khoá làm mới cache cho pipeline': 'Cho pipeline nạp dữ liệu gọi /api/revalidate sau mỗi lần nạp.',
}

export interface VersionRow {
  component: string
  place: string
  version: string
  source: string
}

export function versionRows(s: MapState): VersionRow[] {
  const image = (service: string) => CONTAINERS.find((c) => c.service === service)?.image.split(':')[1] ?? ''
  return [
    { component: 'Node.js', place: `Vercel ${PLACEMENT.vercelRegion}`, version: s.deployment.node, source: 'Đọc trực tiếp' },
    ...STACK.map((x) => ({ component: x.name, place: 'Ứng dụng', version: x.version, source: 'package.json, khoảng cho phép' })),
    { component: 'Postgres', place: 'EC2', version: s.database.version ?? image('db'), source: s.database.version ? 'Đọc trực tiếp' : 'docker-compose.yml' },
    { component: 'GoTrue', place: 'EC2', version: s.auth.version ?? image('auth'), source: s.auth.version ? 'Đọc trực tiếp' : 'docker-compose.yml' },
    { component: 'PostgREST', place: 'EC2', version: image('rest'), source: 'docker-compose.yml' },
    { component: 'Envoy', place: 'EC2', version: image('api-gw'), source: 'docker-compose.yml' },
    { component: 'postgres-meta', place: 'EC2', version: image('meta'), source: 'docker-compose.yml' },
    { component: 'Studio', place: 'EC2', version: image('studio'), source: 'docker-compose.yml' },
  ]
}

export function VersionTable({ rows }: { rows: VersionRow[] }) {
  return (
    <ul className="divide-y divide-black/5 rounded-lg border border-black/10 text-sm">
      {rows.map((r) => (
        <li key={r.component} className="grid grid-cols-[1fr_auto] gap-x-4 px-4 py-2 sm:grid-cols-[12rem_8rem_1fr_9rem]">
          <span className="font-medium">{r.component}</span>
          <span className="text-black/55 sm:order-none">{r.place}</span>
          <span className="font-mono text-xs break-all text-black/80 sm:text-sm">{r.version}</span>
          <span className="text-right text-xs text-black/45 sm:text-left sm:text-sm">{r.source}</span>
        </li>
      ))}
    </ul>
  )
}

/** Where each kind of data is kept, for the question "if this machine goes, what is lost". */
export function DataPlaces({ bucket }: { bucket: string | null }) {
  const places = [
    { what: 'Database chính', where: `Postgres trong container supabase-db, trên ổ gp3 30 GB của máy EC2 ở ${PLACEMENT.awsRegionName}`, holds: 'Từ điển (schema lex), tài khoản (auth), sổ tay và lịch ôn (public)' },
    { what: 'Bản dump hằng ngày', where: bucket ? `S3, bucket ${bucket}` : 'S3', holds: 'Toàn bộ database, đủ để dựng lại trên một Postgres 17 khác' },
    { what: 'Bản sao cũ', where: `Supabase Cloud, dự án ${PLACEMENT.cloudCopyRef}`, holds: 'Dữ liệu tới ngày chuyển sang EC2, không nhận ghi mới' },
    { what: 'Cache từ điển', where: 'Vercel Data Cache, tag lex', holds: 'Kết quả tra cứu và trang mục từ, tối đa 7 ngày' },
    { what: 'Phiên đăng nhập', where: 'Cookie trong trình duyệt của người học', holds: 'Tài khoản ẩn danh chỉ tồn tại trong cookie này' },
  ]
  return (
    <ul className="divide-y divide-black/5 rounded-lg border border-black/10 text-sm">
      {places.map((p) => (
        <li key={p.what} className="grid gap-x-4 gap-y-0.5 px-4 py-2.5 sm:grid-cols-[10rem_1fr]">
          <span className="font-medium">{p.what}</span>
          <div className="min-w-0">
            <div className="break-words">{p.where}</div>
            <div className="text-black/55">{p.holds}</div>
          </div>
        </li>
      ))}
    </ul>
  )
}
