import Link from 'next/link'
import type { DictColumn, DictLink, DictTable, Dictionary } from '@/lib/admin/dictionary'
import { formatBytes } from '@/lib/admin/metrics'
import { num } from '@/components/admin/Page'

/** 0041 and 0061 prefix every table comment with "zhesen:" to mark ownership in Studio. */
export function purpose(comment: string | null): string {
  const text = comment?.replace(/^zhesen:\s*/, '')
  return text ? text[0].toUpperCase() + text.slice(1) : 'Chưa có mô tả.'
}

const ON_DELETE: Record<string, string> = {
  cascade: 'xoá theo',
  'set null': 'về null',
  'set default': 'về mặc định',
  restrict: 'chặn xoá',
  'no action': 'chặn xoá',
}

/** What deleting the referenced row does to this one, said in full next to a column. */
const ON_DELETE_LONG: Record<string, string> = {
  cascade: 'xoá dòng kia thì dòng này bị xoá theo',
  'set null': 'xoá dòng kia thì cột này về null',
  'set default': 'xoá dòng kia thì cột này về giá trị mặc định',
  restrict: 'không xoá được dòng kia khi còn dòng này trỏ tới',
  'no action': 'không xoá được dòng kia khi còn dòng này trỏ tới',
}

const tableHref = (id: string) => `/admin/data?table=${id}`

/** A table this page documents gets a link; one outside it, such as auth.users, is named only. */
function TableName({ id, children }: { id: string; children: string }) {
  if (!SCHEMAS.some((s) => id.startsWith(`${s.name}.`))) {
    return <span className="font-mono text-black/75" title="Bảng của Supabase, ngoài ba schema của dự án">{children}</span>
  }
  return (
    <Link href={tableHref(id)} prefetch={false} className="font-mono text-black/75 underline decoration-black/20 hover:decoration-black">
      {children}
    </Link>
  )
}

/** Most-read first. `public` carries Supabase's stock comment, so each schema is described here. */
const SCHEMAS: { name: string; about: string }[] = [
  { name: 'lex', about: 'Nội dung từ điển. zhesen-pipeline nạp dữ liệu, admin sửa qua các hàm của schema admin, người dùng chỉ đọc.' },
  { name: 'public', about: 'Dữ liệu của từng tài khoản: sổ tay, lịch ôn, ngày luyện tập, hồ sơ; cùng nhật ký quản trị.' },
  { name: 'admin', about: 'Bảng và hàm của bảng điều khiển. Mọi hàm kiểm tra quyền quản trị trước khi chạy.' },
]

/** Every table in one list per schema, with what it holds, its rows and its size. */
export function TableIndex({ dict }: { dict: Dictionary }) {
  return (
    <div className="flex flex-col gap-8">
      {SCHEMAS.map((s) => {
        const tables = dict.tables.filter((t) => t.schema === s.name)
        if (tables.length === 0) return null
        const bytes = tables.reduce((n, t) => n + t.bytes, 0)
        return (
          <section key={s.name}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-mono text-base font-semibold">{s.name}</h2>
              <span className="text-sm text-black/55 tabular-nums">{tables.length} bảng · {formatBytes(bytes)}</span>
            </div>
            <p className="mt-0.5 text-sm text-black/60">{s.about}</p>
            <ul className="mt-3 divide-y divide-black/5 rounded-lg border border-black/10">
              {tables.map((t) => (
                <li key={t.id}>
                  <Link
                    href={tableHref(t.id)}
                    prefetch={false}
                    className="grid gap-x-4 gap-y-0.5 px-4 py-2.5 hover:bg-black/[0.03] sm:grid-cols-[13rem_1fr_auto]"
                  >
                    <span className="font-mono text-sm font-medium">{t.name}</span>
                    <span className="text-sm text-black/60 sm:line-clamp-2">{purpose(t.comment)}</span>
                    <span className="text-sm text-black/55 tabular-nums sm:text-right">
                      {num(t.rows)} dòng · {formatBytes(t.bytes)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function Tag({ children, tone = 'plain' }: { children: string; tone?: 'plain' | 'key' }) {
  return (
    <span className={`rounded px-1.5 py-px text-xs ${tone === 'key' ? 'bg-amber-50 text-amber-800' : 'bg-black/[0.05] text-black/60'}`}>
      {children}
    </span>
  )
}

function Column({ c }: { c: DictColumn }) {
  return (
    <li className="grid gap-x-6 gap-y-1 px-4 py-3 sm:grid-cols-[15rem_1fr]">
      <div className="min-w-0">
        <div className="font-mono text-sm font-medium break-all">{c.name}</div>
        <div className="font-mono text-xs text-black/50 break-all">{c.type}</div>
      </div>
      <div className="min-w-0">
        <p className="text-sm">{c.comment ?? <span className="text-black/45">Chưa có mô tả.</span>}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {c.primaryKey && <Tag tone="key">khoá chính</Tag>}
          <Tag>{c.nullable ? 'có thể trống' : 'bắt buộc'}</Tag>
          {c.generated && <Tag>tính từ cột khác</Tag>}
          {c.identity && <Tag>tự tăng</Tag>}
          {c.default && (
            <span className="text-xs text-black/50">
              mặc định <code className="font-mono break-all text-black/70">{c.default}</code>
            </span>
          )}
          {c.references && (
            <span className="text-xs text-black/50">
              tham chiếu{' '}
              <TableName id={c.references.table}>{`${c.references.table}.${c.references.column}`}</TableName>
              ; {ON_DELETE_LONG[c.references.onDelete]}
            </span>
          )}
        </div>
      </div>
    </li>
  )
}

function Links({ title, links, empty }: { title: string; links: DictLink[]; empty: string }) {
  return (
    <div className="rounded-lg border border-black/10 px-4 py-3">
      <h3 className="text-sm font-medium">{title}</h3>
      {links.length === 0 ? (
        <p className="mt-1 text-sm text-black/50">{empty}</p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1 text-sm">
          {links.map((l) => (
            <li key={`${l.table}:${l.columns.join(',')}`} className="min-w-0">
              <TableName id={l.table}>{l.table}</TableName>
              <span className="text-black/55"> qua <code className="font-mono">{l.columns.join(', ')}</code>, {ON_DELETE[l.onDelete]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** One table: purpose, size, every column with its meaning, the tables around it and its indexes. */
export function TableDetail({ t }: { t: DictTable }) {
  const facts = [
    `${num(t.rows)} dòng`,
    formatBytes(t.bytes),
    `${t.columns.length} cột`,
    `${t.indexes.length} index`,
    t.rls ? 'Có RLS' : 'Không có RLS',
  ]
  return (
    <div>
      <Link href="/admin/data" prefetch={false} className="text-sm text-black/55 hover:underline">Mọi bảng</Link>
      <h1 className="mt-2 font-mono text-2xl font-semibold tracking-tight break-all">{t.id}</h1>
      <p className="mt-2 max-w-3xl text-sm text-black/70">{purpose(t.comment)}</p>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-black/60 tabular-nums">
        {facts.map((f) => <li key={f}>{f}</li>)}
      </ul>

      <h2 className="mt-8 mb-3 text-base font-semibold">Cột</h2>
      <ul className="divide-y divide-black/5 rounded-lg border border-black/10">
        {t.columns.map((c) => <Column key={c.name} c={c} />)}
      </ul>

      <h2 className="mt-8 mb-3 text-base font-semibold">Quan hệ</h2>
      <div className="grid gap-3 lg:grid-cols-2">
        <Links title="Bảng này trỏ tới" links={t.references} empty="Không trỏ tới bảng nào." />
        <Links title="Các bảng trỏ vào bảng này" links={t.referencedBy} empty="Không bảng nào trỏ vào." />
      </div>

      <h2 className="mt-8 mb-3 text-base font-semibold">Index</h2>
      <ul className="divide-y divide-black/5 rounded-lg border border-black/10">
        {t.indexes.map((i) => (
          <li key={i.name} className="px-4 py-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-mono text-sm break-all">{i.name}</span>
              <span className="text-xs text-black/50 tabular-nums">
                {/pgroonga/i.test(i.definition) ? 'nằm ngoài Postgres, xem Dung lượng ở Tổng quan' : formatBytes(i.bytes)}
              </span>
            </div>
            <code className="mt-0.5 block font-mono text-xs break-all text-black/55">{i.definition}</code>
          </li>
        ))}
      </ul>
    </div>
  )
}
