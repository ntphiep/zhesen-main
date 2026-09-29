import { ACTION_LABELS, type AuditEntry } from '@/lib/admin/audit'
import { CARD, when } from '@/components/admin/Page'

const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v))

/** Admin writes, newest first, from `public.admin_audit`. The detail is printed as
 *  field and value, because it holds the values before and after the change. */
export function AuditLog({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-(--zs-soft)">No admin actions yet.</p>
  }
  return (
    <ol className={`divide-y divide-(--zs-line) ${CARD}`}>
      {entries.map((e) => (
        <li key={e.id} className="grid gap-x-4 gap-y-1 px-4 py-2.5 text-sm sm:grid-cols-[8.5rem_1fr]">
          <time dateTime={e.at} className="text-(--zs-soft) tabular-nums">{when(e.at)}</time>
          <div className="min-w-0">
            <div>
              <span className="font-medium">{ACTION_LABELS[e.action] ?? e.action}</span>
              {e.target && <span className="ml-2 font-mono text-xs break-all text-(--zs-soft)">{e.target}</span>}
            </div>
            {Object.keys(e.detail).length > 0 && (
              <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                {Object.entries(e.detail).map(([k, v]) => (
                  <div key={k} className="flex min-w-0 gap-1">
                    <dt className="text-(--zs-soft)">{k}</dt>
                    <dd className="min-w-0 font-mono break-all text-(--zs-soft)">{show(v)}</dd>
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
