import type { WordlistStats } from '@/lib/wordlist/stats'

const STATUS_LABEL = { new: 'Mới', learning: 'Đang học', known: 'Đã biết' } as const
const LANG_LABEL = { en: 'Tiếng Anh', es: 'Tiếng Tây Ban Nha', zh: 'Tiếng Trung' } as const

function Bar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-32 shrink-0 text-black/60">{label}</span>
      <div className="h-2 flex-1 rounded-full bg-black/5">
        <div className="h-2 rounded-full bg-black/70" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-black/50">{count}</span>
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
        {(Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((k) => (
          <Bar key={k} label={STATUS_LABEL[k]} count={stats.byStatus[k]} total={stats.total} />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-black/70">Theo ngôn ngữ</h2>
        {(Object.keys(LANG_LABEL) as (keyof typeof LANG_LABEL)[]).map((k) => (
          <Bar key={k} label={LANG_LABEL[k]} count={stats.byLang[k]} total={stats.total} />
        ))}
      </div>
    </div>
  )
}
