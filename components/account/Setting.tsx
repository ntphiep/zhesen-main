import type { ReactNode } from 'react'
import s from './Account.module.css'

/** One row of the settings list on /account: its name on the left, its control on the right. */
export function Setting({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className={s.set}>
      <div className={s.setHead}>
        <h2>{title}</h2>
        {hint && <p>{hint}</p>}
      </div>
      <div className={s.setBody}>{children}</div>
    </section>
  )
}
