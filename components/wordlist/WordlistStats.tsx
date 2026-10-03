'use client'
import { useDailyGoal } from '@/lib/hooks/useDailyGoal'
import { MAX_FREEZES } from '@/lib/wordlist/activity'
import { goalProgress } from '@/lib/wordlist/goal'
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
  const [goal] = useDailyGoal()
  if (stats.total === 0) return null
  const today = goalProgress(stats.reviewedToday, goal)
  const kept = stats.streakDetail
  return (
    <div className={`${s.stats} font-ui`}>
      {CARDS.map((c) => (
        <div key={c.key} className={s.stat} data-k={c.key} data-met={c.key === 'reviewedToday' && today.met ? '' : undefined}>
          <b>
            {stats[c.key]}
            {c.key === 'streak' && FLAME}
            {c.key === 'reviewedToday' && <small>/{goal}</small>}
          </b>
          <span>{c.key === 'reviewedToday' && today.met ? 'Đủ mục tiêu hôm nay' : c.label}</span>
          {c.key === 'streak' && kept && <em>{kept.freezes}/{MAX_FREEZES} lượt giữ chuỗi</em>}
          {c.key === 'streak' && kept?.savedYesterday && <em>Hôm qua đã dùng một lượt</em>}
        </div>
      ))}
    </div>
  )
}
