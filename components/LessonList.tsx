import Link from 'next/link'
import type { Lesson, LangCode } from '@/lib/content/types'

export function LessonList({ lang, lessons }: { lang: LangCode; lessons: Lesson[] }) {
  return (
    <ul className="space-y-3">
      {lessons.map((l) => (
        <li key={l.id}>
          <Link
            href={`/learn/${lang}/lesson/${l.id}`}
            className="block rounded-xl border border-black/10 p-4 hover:bg-black/5"
          >
            <div className="font-medium">{l.title}</div>
            {l.description && <div className="text-sm text-black/60">{l.description}</div>}
          </Link>
        </li>
      ))}
    </ul>
  )
}
