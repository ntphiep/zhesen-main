import Link from 'next/link'
import { theoryLangPath } from '@/lib/theory/path'
import { BLOCKS_BY_LANG } from '@/lib/theory/blocks'
import type { Language, LangCode } from '@/lib/languages'

/** `/theory`: one card per language, listing the blocks that language has. */
export function TheoryLangList({ languages, grammarCounts }: {
  languages: readonly Language[]
  grammarCounts: Record<LangCode, number>
}) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/" className="text-sm text-black/50 hover:underline">← Trang chủ</Link>
      <h1 className="mt-3 text-3xl font-bold">Lý thuyết</h1>
      <p className="mt-1 text-sm text-black/60">
        Học phần không đổi của một ngôn ngữ: âm, từ loại, cấu trúc câu, ngữ pháp và những từ đi với nhau.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {languages.map((l) => (
          <Link
            key={l.code}
            href={theoryLangPath(l.code)}
            className="group rounded-2xl border border-black/10 p-5 transition hover:border-black/30 hover:shadow-lg hover:-translate-y-0.5"
          >
            <div className="text-lg font-medium text-black/70">{l.nativeName}</div>
            <div className="mt-2 text-lg font-semibold">{l.name}</div>
            <div className="mt-1 text-sm text-black/55">
              {BLOCKS_BY_LANG[l.code].length} phần · {grammarCounts[l.code]} điểm ngữ pháp
            </div>
          </Link>
        ))}
      </div>
    </main>
  )
}
