import type { WordlistStats as Stats } from '@/lib/wordlist/stats'
import s from './Progress.module.css'

type NumericStatKey = 'streak' | 'total' | 'due' | 'learned' | 'reviewedToday'

const CARDS: { key: NumericStatKey; label: string }[] = [
  { key: 'streak', label: 'Chuỗi ngày' },
  { key: 'total', label: 'Tổng số từ' },
  { key: 'due', label: 'Cần ôn' },
  { key: 'learned', label: 'Đã thuộc' },
  { key: 'reviewedToday', label: 'Đã ôn hôm nay' },
]

const FLAME = (
  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 18a5.5 5.5 0 0 0 5.5-5.5c0-3-2-4.7-3-7.5-1.4 1.2-2 2.6-2 4-1-.6-1.6-1.6-1.7-2.9C6.3 7.7 4.5 9.9 4.5 12.5A5.5 5.5 0 0 0 10 18z" />
  </svg>
)

export function WordlistStats({ stats }: { stats: Stats }) {
  if (stats.total === 0) return null
  return (
    <div className={`${s.stats} font-ui`}>
      {CARDS.map((c) => (
        <div key={c.key} className={s.stat} data-k={c.key}>
          <b>{stats[c.key]}{c.key === 'streak' && FLAME}</b>
          <span>{c.label}</span>
        </div>
      ))}
    </div>
  )
}
