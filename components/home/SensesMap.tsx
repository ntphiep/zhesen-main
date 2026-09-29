'use client'
import { useState } from 'react'
import type { TakeMap } from '@/lib/home/landing'
import { onTabKey } from './tabs'
import s from './Landing.module.css'

/** Take's main senses as tabs, each with its collocations, an example and the Chinese and
 *  Spanish words for it. */
export function SensesMap({ take }: { take: TakeMap }) {
  const [i, setI] = useState(0)
  const sense = take.senses[i]
  const tone = (n: number) => n % 5
  return (
    <div className={s.senseMap} data-reveal="" data-i="2">
      <ol role="tablist" aria-label={`Nghĩa chính của ${take.headword}`} aria-orientation="vertical" onKeyDown={(e) => onTabKey(e, i, take.senses.length, setI)}>
        {take.senses.map((x, n) => (
          <li key={n} role="presentation">
            <button
              type="button"
              role="tab"
              id={`sense-${n}`}
              aria-controls="sense-panel"
              aria-selected={n === i}
              tabIndex={n === i ? 0 : -1}
              data-tone={tone(n)}
              onClick={() => setI(n)}
            >
              <span className={s.n}>{n + 1}</span><span className={s.t}>{x.terms}</span><span className={s.l}>{x.level}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className={s.sense} id="sense-panel" role="tabpanel" aria-labelledby={`sense-${i}`} data-tone={tone(i)}>
        <div key={`a${i}`} className={s.swap}>
          <h3>{sense.terms}</h3>
          <p className={s.def}>{sense.definition}</p>
          {sense.example && (
            <div className={s.ex}>
              <p lang="en">{sense.example.parts.map((p, n) => (p.mark ? <b key={n}>{p.text}</b> : p.text))}</p>
              <small>{sense.example.vi}</small>
            </div>
          )}
          <div className={s.other}>
            {sense.zh && <><span>Tiếng Trung</span><b lang="zh">{sense.zh}</b></>}
            {sense.es && <><span>Tiếng Tây Ban Nha</span><i lang="es">{sense.es}</i></>}
          </div>
        </div>
        <div key={`b${i}`} className={s.swap} style={{ animationDelay: '40ms' }}>
          <h4>Cụm từ hay gặp</h4>
          <ul>
            {sense.collocations.map((c) => (
              <li key={c.text}>
                <span className={s.co} lang="en">{c.text}</span>
                {c.pattern && <span className={s.fx}>{c.pattern}</span>}
                {c.vi && <span className={s.cv}>{c.vi}</span>}
              </li>
            ))}
          </ul>
          {sense.notes.map((x) => (
            <span key={x.text} className={s.syn}><b lang="en">{x.text}</b> {x.antonym ? 'Trái nghĩa. ' : ''}{x.note}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
