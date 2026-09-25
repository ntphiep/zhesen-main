import type { Mistake } from '@/lib/theory/types'

/** The wrong sentence struck through, the right one under it, the rule in one line.
 *  Shared by every block, because the mistake is the part a learner comes back for. */
export function MistakeList({ mistakes }: { mistakes: readonly Mistake[] }) {
  if (mistakes.length === 0) return null
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-700">Lỗi hay mắc</h2>
      <ul className="mt-2 flex flex-col gap-3">
        {mistakes.map((m) => (
          <li key={m.wrong}>
            <p className="text-amber-900/70 line-through">{m.wrong}</p>
            <p className="font-medium text-amber-900">{m.right}</p>
            <p className="mt-0.5 text-sm text-amber-900/80">{m.whyVi}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
