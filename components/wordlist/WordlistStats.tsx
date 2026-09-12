import type { WordlistStats as Stats } from '@/lib/wordlist/stats'

type NumericStatKey = 'streak' | 'total' | 'due' | 'learned' | 'reviewedToday'

const CARDS: { key: NumericStatKey; label: string; suffix?: string }[] = [
  { key: 'streak', label: 'Chuỗi ngày', suffix: ' 🔥' },
  { key: 'total', label: 'Tổng số từ' },
  { key: 'due', label: 'Cần ôn' },
  { key: 'learned', label: 'Đã thuộc' },
  { key: 'reviewedToday', label: 'Đã ôn hôm nay' },
]

export function WordlistStats({ stats }: { stats: Stats }) {
  if (stats.total === 0) return null
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
      {CARDS.map((c) => (
        <div key={c.key} className="rounded-xl border border-black/10 px-4 py-3">
          <div className="text-2xl font-semibold">{stats[c.key]}{c.suffix ?? ''}</div>
          <div className="text-xs text-black/50">{c.label}</div>
        </div>
      ))}
    </div>
  )
}
