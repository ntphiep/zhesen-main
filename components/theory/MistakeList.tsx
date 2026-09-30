import { Warn } from './Glyphs'
import s from './Theory.module.css'
import type { Mistake } from '@/lib/theory/types'

/** The wrong sentence struck through, the right one under it, the rule in one line.
 *  Shared by every block, because the mistake is the part a learner comes back for. */
export function MistakeList({ mistakes }: { mistakes: readonly Mistake[] }) {
  if (mistakes.length === 0) return null
  return (
    <section className={s.callout}>
      <h2 className={s.label}><Warn />Lỗi hay mắc</h2>
      <ul>
        {mistakes.map((m) => (
          <li key={m.wrong}>
            <p className={s.wrong}><span className="sr-only">Sai: </span><span className={s.src} lang="en">{m.wrong}</span></p>
            <p className={s.right}><span className="sr-only">Đúng: </span><span className={s.src} lang="en">{m.right}</span></p>
            <p className={s.why}>{m.whyVi}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
