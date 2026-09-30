import s from './Theory.module.css'
import type { Example } from '@/lib/theory/types'

/** An example and what it means, one under the other: the sentence in its own face, the
 *  translation in the page's. The reader is learning the language the example is written
 *  in, so the translation is never optional. */
export function ExampleList({ examples }: { examples: readonly Example[] }) {
  if (examples.length === 0) return null
  return (
    <ul className={s.examples}>
      {examples.map((e) => (
        <li key={e.en} className={s.example}>
          <p className={s.src} lang="en">{e.en}</p>
          <p className={s.vi}>{e.vi}</p>
        </li>
      ))}
    </ul>
  )
}
