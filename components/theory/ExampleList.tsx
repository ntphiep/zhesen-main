import type { Example } from '@/lib/theory/types'

/** An example and what it means, one under the other. The reader is learning the
 *  language the example is written in, so the translation is never optional. */
export function ExampleList({ examples }: { examples: readonly Example[] }) {
  if (examples.length === 0) return null
  return (
    <ul className="flex flex-col gap-2">
      {examples.map((e) => (
        <li key={e.en} className="border-l-2 border-black/10 pl-3">
          <p className="text-black/85">{e.en}</p>
          <p className="text-sm text-black/50">{e.vi}</p>
        </li>
      ))}
    </ul>
  )
}
