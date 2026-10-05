import type { LangProgress } from '@/lib/wordlist/stats'
import type { Skill } from '@/lib/practice/grading'
import s from './Progress.module.css'

const SKILLS: { skill: Skill; label: string }[] = [
  { skill: 'recall', label: 'Nhớ ra' },
  { skill: 'recognition', label: 'Nhận ra' },
]

// Same segments and tones as the home page's meter: learned, learning, never reviewed.
const PARTS = [
  { part: 'learned', tone: 'known', label: 'Đã thuộc' },
  { part: 'learning', tone: 'learning', label: 'Đang học' },
  { part: 'unseen', tone: 'new', label: 'Chưa ôn' },
] as const

/** One stacked meter per skill: recall is graded by review, write, dictation and speak,
 *  recognition by quiz and match. */
export function SkillMeters({ skills }: { skills: Record<Skill, LangProgress> }) {
  return (
    <div className={s.skills}>
      {SKILLS.map(({ skill, label }) => {
        const p = skills[skill]
        return (
          <div key={skill}>
            <div className={s.row}>
              <span>{label}</span>
              <div className={`${s.track} ${s.stack}`} aria-hidden="true">
                {PARTS.filter(({ part }) => p[part] > 0).map(({ part, tone }) => (
                  <i key={part} data-c={tone} style={{ flexGrow: p[part] }} />
                ))}
              </div>
              <span>{p.learned}</span>
            </div>
            <p className={s.note}>{PARTS.map(({ part, label: l }) => `${l} ${p[part]}`).join(' · ')}</p>
          </div>
        )
      })}
    </div>
  )
}
