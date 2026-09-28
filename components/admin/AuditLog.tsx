import { ACTION_LABELS, type AuditEntry } from '@/lib/admin/audit'
import { when } from '@/components/admin/Page'

const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v))

/** Admin writes, newest first, from `public.admin_audit`. The detail is printed as
 *  field and value, because it holds the values before and after the change. */
export function AuditLog({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-black/60">No admin actions yet.</p>
  }
  return (
    <ol className="divide-y divide-black/5 rounded-lg border border-black/10">
      {entries.map((e) => (
        <li key={e.id} className="grid gap-x-4 gap-y-1 px-4 py-2.5 text-sm sm:grid-cols-[8.5rem_1fr]">
          <time dateTime={e.at} className="text-black/55 tabular-nums">{when(e.at)}</time>
          <div className="min-w-0">
            <div>
              <span className="font-medium">{ACTION_LABELS[e.action] ?? e.action}</span>
              {e.target && <span className="ml-2 font-mono text-xs break-all text-black/55">{e.target}</span>}
            </div>
            {Object.keys(e.detail).length > 0 && (
              <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                {Object.entries(e.detail).map(([k, v]) => (
                  <div key={k} className="flex min-w-0 gap-1">
                    <dt className="text-black/55">{k}</dt>
                    <dd className="min-w-0 font-mono break-all text-black/70">{show(v)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
