import Link from 'next/link'
import { grammarPointPath } from '@/lib/grammar/path'
import type { GrammarPoint } from '@/lib/grammar/types'

/** "Ngữ pháp liên quan": grammar points whose pattern/title uses this word
 * (see `lex.grammar_point_entries`, populated by a one-off matching script). */
export function GrammarLinks({ points }: { points: GrammarPoint[] }) {
  if (points.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Ngữ pháp liên quan</h2>
      <div className="flex flex-col gap-2">
        {points.map((p) => (
          <Link
            key={p.id}
            href={grammarPointPath(p.id)}
            className="rounded-lg border border-black/10 px-3 py-2 text-sm hover:bg-black/5"
          >
            <span className="text-black/40">{p.level}</span> {p.titleVi}
          </Link>
        ))}
      </div>
    </section>
  )
}
