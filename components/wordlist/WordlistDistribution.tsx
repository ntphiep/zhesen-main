import type { WordlistStats } from '@/lib/wordlist/stats'
import { STATUS_OPTIONS } from '@/lib/wordlist/types'
import { LANGUAGES } from '@/lib/languages'
import { SkillMeters } from './SkillMeters'
import s from './Progress.module.css'

function Bar({ label, count, total, tone }: { label: string; count: number; total: number; tone: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className={s.row}>
      <span>{label}</span>
      <div className={s.track}>
        <i data-c={tone} style={{ width: `${pct}%` }} />
      </div>
      <span>{count}</span>
    </div>
  )
}

/** Word-count distribution by learning status, by target language and by skill. */
export function WordlistDistribution({ stats }: { stats: WordlistStats }) {
  if (stats.total === 0) return null
  return (
    <div className={`${s.dist} font-ui`}>
      <div className={s.panel}>
        <h2>Theo trạng thái</h2>
        {STATUS_OPTIONS.map(([status, label]) => (
          <Bar key={status} label={label} count={stats.byStatus[status]} total={stats.total} tone={status} />
        ))}
      </div>
      <div className={s.panel}>
        <h2>Theo ngôn ngữ</h2>
        {LANGUAGES.map((l) => (
          <Bar key={l.code} label={l.name} count={stats.byLang[l.code]} total={stats.total} tone={l.code} />
        ))}
      </div>
      {stats.skills && (
        <div className={s.panel} data-span="">
          <h2>Theo kỹ năng</h2>
          <SkillMeters skills={stats.skills} />
        </div>
      )}
    </div>
  )
}
