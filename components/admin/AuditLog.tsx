import { ACTION_LABELS, type AuditEntry } from '@/lib/admin/audit'
import { STUDY_TIMEZONE } from '@/lib/wordlist/activity'

const when = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', { timeZone: STUDY_TIMEZONE, dateStyle: 'short', timeStyle: 'short' })

/** The latest admin writes, newest first, from `public.admin_audit`. */
export function AuditLog({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-black/60">Chưa có thao tác quản trị nào.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-black/10 text-left text-xs font-medium uppercase tracking-wide text-black/45">
            <th className="py-2 pr-4">Thời điểm</th>
            <th className="py-2 pr-4">Thao tác</th>
            <th className="py-2 pr-4">Đối tượng</th>
            <th className="py-2">Chi tiết</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-black/5 align-top">
              <td className="whitespace-nowrap py-1.5 pr-4 tabular-nums">{when(e.at)}</td>
              <td className="whitespace-nowrap py-1.5 pr-4">{ACTION_LABELS[e.action] ?? e.action}</td>
              <td className="py-1.5 pr-4 font-mono text-xs break-all">{e.target ?? ''}</td>
              <td className="py-1.5 font-mono text-xs break-all text-black/60">{JSON.stringify(e.detail)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
