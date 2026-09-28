import type { WordlistStats } from '@/lib/wordlist/stats'
import { STATUS_OPTIONS } from '@/lib/wordlist/types'
import { LANGUAGES } from '@/lib/languages'

function Bar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-32 shrink-0 text-black/60">{label}</span>
      <div className="h-2 flex-1 rounded-full bg-black/5">
        <div className="h-2 rounded-full bg-black/70" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-black/55">{count}</span>
    </div>
  )
}

/** Word-count distribution by learning status and by target language. */
export function WordlistDistribution({ stats }: { stats: WordlistStats }) {
  if (stats.total === 0) return null
  return (
    <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-black/70">Theo trạng thái</h2>
        {STATUS_OPTIONS.map(([status, label]) => (
          <Bar key={status} label={label} count={stats.byStatus[status]} total={stats.total} />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-black/70">Theo ngôn ngữ</h2>
        {LANGUAGES.map((l) => (
          <Bar key={l.code} label={l.name} count={stats.byLang[l.code]} total={stats.total} />
        ))}
      </div>
    </div>
  )
}
