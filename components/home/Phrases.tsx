import Link from 'next/link'
import type { Equivalent, PhraseFamily } from '@/lib/home/landing'
import s from './Landing.module.css'

function Eq({ e, lang, label }: { e: Equivalent | null; lang: 'zh' | 'es'; label: string }) {
  if (!e) return null
  return (
    <span className={s.eq} data-l={lang} data-label={label}>
      <span className="sr-only">{label}: </span>
      {e.href ? <Link href={e.href} prefetch={false} lang={lang}>{e.text}</Link> : <span lang={lang}>{e.text}</span>}
    </span>
  )
}

/** One verb splitting into its phrasal verbs, each with its Vietnamese meaning and the
 *  Chinese and Spanish words for that meaning. The branches draw in as the rows rise. */
export function Phrases({ family }: { family: PhraseFamily }) {
  return (
    <div className={s.split} data-reveal="" data-i="2">
      <div className={s.root}>
        <Link href={family.href} prefetch={false} lang="en">{family.verb}</Link>
        {family.verbVi && <span>{family.verbVi}</span>}
      </div>
      <div className={s.branches}>
        <div className={s.cols} aria-hidden="true">
          <span>Cụm động từ</span><span>Nghĩa</span><span>Tiếng Trung</span><span>Tiếng Tây Ban Nha</span>
        </div>
        <ol>
          {family.phrases.map((p, n) => (
            <li key={p.href} data-tone={n % 5} data-reveal="" data-i={Math.min(n, 5)}>
              <Link className={s.pv} href={p.href} prefetch={false} lang="en">{family.verb} <b>{p.particle}</b></Link>
              <span className={s.pvVi}>{p.vi}</span>
              <Eq e={p.zh} lang="zh" label="Tiếng Trung" />
              <Eq e={p.es} lang="es" label="Tiếng Tây Ban Nha" />
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
